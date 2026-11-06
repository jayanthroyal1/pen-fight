import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import '@babylonjs/core/Particles/particleSystemComponent';
import { GlowLayer } from '@babylonjs/core/Layers/glowLayer';
import '@babylonjs/core/Rendering/outlineRenderer';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import { PhysicsCharacterController } from '@babylonjs/core/Physics/v2/characterController';
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import '@babylonjs/core/Physics/v2/physicsEngineComponent';
import { CellMaterial } from '@babylonjs/materials/cell/cellMaterial';
import HavokPhysics from '@babylonjs/havok';
import havokWasm from '@babylonjs/havok/lib/esm/HavokPhysics.wasm?url';
import { onAwayChange } from '../platform/lifecycle';
import { buzz, sfx } from '../platform/sfx';
import { poseFor, type Stance } from '../swordGame/pose';
import { RealFighter, fileUrl, readManifest, type FighterFiles } from './realFighter';
import { Brain } from './ai';
import { clearDistance, lockOnDistance, stepsDue, stickToWorld, type Pillar } from './camera';
import { Duel, FIXED_MS, advance, bladeAt, isSwinging, newFighter, noCommand, separate, settlePush, wantedVelocity, type Command, type CombatEvent, type Fighter } from './combat';
import { heroSpec, villainSpec, type ArenaId, type Chapter, type Hero } from './roster';
import type { Blade, V3 } from './sweep';

/** How much the device can show. Set once, then stepped down if frames run slow. */
export type Quality = 'low' | 'medium' | 'high';

export interface PlayerInput {
  stickX: number;
  stickY: number;
  guard: boolean;
  light: boolean;
  heavy: boolean;
  dodge: boolean;
  special: boolean;
}

export const newInput = (): PlayerInput => ({ stickX: 0, stickY: 0, guard: false, light: false, heavy: false, dodge: false, special: false });

export interface Hud {
  hp: number;
  foeHp: number;
  stamina: number;
  guard: number;
  energy: number;
  /** Which swing of the combo is live: 0 for none, then 1 to 3. */
  combo: number;
  guarding: boolean;
  /** Can't act: the controls show it. */
  stunned: boolean;
  /** Blows landed so far, so a control can flash when one connects. */
  landed: number;
}

export interface FightOptions {
  canvas: HTMLCanvasElement;
  hero: Hero;
  chapter: Chapter;
  blood: boolean;
  quality: Quality;
  input: PlayerInput;
  onHud: (hud: Hud) => void;
  onCall: (text: string) => void;
  onEnd: (won: boolean) => void;
  onAway: () => void;
}

const ARENA_RADIUS = 11;
const GRAVITY = new Vector3(0, -9.81, 0);
const DOWN = new Vector3(0, -1, 0);
const CAPSULE_HEIGHT = 1.75;
const CAPSULE_RADIUS = 0.36;
const END_AFTER_MS = 2300;
const SLOW_FRAME_MS = 40;
const REST_SWORD_UP = 0.9;
/** How far to the side of the player the camera sits. */
const SHOULDER = 1.7;

interface Look {
  sky: string;
  haze: string;
  floor: string;
  stone: string;
  sun: string;
}

const ARENAS: Record<ArenaId, Look> = {
  ashfield: { sky: '#2a1016', haze: '#d9541e', floor: '#3a2a26', stone: '#5a4238', sun: '#ffc18a' },
  warcamp: { sky: '#1f0d0b', haze: '#b3301a', floor: '#33221c', stone: '#4a2c22', sun: '#ff9a5a' },
  silverhall: { sky: '#1a2233', haze: '#8fa8c8', floor: '#56606e', stone: '#8a95a5', sun: '#eaf2ff' },
  stormtemple: { sky: '#0f1a2e', haze: '#4a6f9c', floor: '#2f3a48', stone: '#46566a', sun: '#bcd4ff' },
  riftgate: { sky: '#120a26', haze: '#6a3ea8', floor: '#231a3a', stone: '#3a2c5c', sun: '#d8c0ff' },
  voidthrone: { sky: '#07040f', haze: '#3a1a6a', floor: '#150f26', stone: '#241a42', sun: '#a06cff' },
};

/** Loads Havok's WebAssembly: the one slow step before a fight. */
async function loadHavok(): Promise<HavokPlugin> {
  const instance = await HavokPhysics({ locateFile: () => havokWasm });
  return new HavokPlugin(false, instance);
}

const tmpA = new Vector3();
const tmpB = new Vector3();
const UP = new Vector3(0, 1, 0);

/** Stretches a unit cylinder between two points. */
function span(mesh: Mesh, a: Vector3, b: Vector3): void {
  b.subtractToRef(a, tmpA);
  const length = tmpA.length() || 0.001;
  mesh.position.copyFrom(a).addInPlace(b).scaleInPlace(0.5);
  mesh.scaling.y = length;
  tmpA.scaleInPlace(1 / length);
  const dot = Vector3.Dot(UP, tmpA);
  Vector3.CrossToRef(UP, tmpA, tmpB);
  const q = mesh.rotationQuaternion!;
  q.set(tmpB.x, tmpB.y, tmpB.z, 1 + dot);
  q.normalize();
}

/**
 * A stand-in fighter, built from toon-shaded shapes with an anime outline. Real
 * rigged models replace this once they're ready: gameplay never reads from it.
 */
class Puppet {
  private readonly root: TransformNode;
  private readonly limbs: Mesh[] = [];
  private readonly head: Mesh;
  private readonly hairGroup: TransformNode;
  private readonly sword: Mesh;
  private readonly skin: CellMaterial;
  private readonly skinColor: Color3;
  private flash = 0;
  readonly tipPoint = new Vector3();
  readonly rootPoint = new Vector3();
  private fallen = 0;

  constructor(scene: Scene, color: string, hair: string, bladeColor: string, private readonly bladeLength: number, shadows: ShadowGenerator | null) {
    this.root = new TransformNode('fighter', scene);
    this.skinColor = Color3.FromHexString(color);
    this.skin = new CellMaterial('cloth', scene);
    this.skin.diffuseColor = this.skinColor.clone();
    this.skin.computeHighLevel = true;
    const flesh = new CellMaterial('flesh', scene);
    flesh.diffuseColor = Color3.FromHexString('#f0c8a0');
    flesh.computeHighLevel = true;
    const hairSkin = new CellMaterial('hair', scene);
    hairSkin.diffuseColor = Color3.FromHexString(hair);
    hairSkin.computeHighLevel = true;

    const outline = (m: Mesh, width = 0.016) => {
      m.renderOutline = true;
      m.outlineWidth = width;
      m.outlineColor = new Color3(0.03, 0.03, 0.05);
      shadows?.addShadowCaster(m);
    };
    const limb = (top: number, bottom: number, material: CellMaterial) => {
      const m = MeshBuilder.CreateCylinder('limb', { height: 1, diameterTop: top, diameterBottom: bottom, tessellation: 10 }, scene);
      m.material = material;
      m.rotationQuaternion = m.rotationQuaternion ?? this.identity();
      m.parent = this.root;
      outline(m);
      this.limbs.push(m);
      return m;
    };
    // Torso, then arms and legs: upper and lower for each.
    limb(0.36, 0.26, this.skin);
    limb(0.1, 0.09, flesh);
    limb(0.09, 0.07, flesh);
    limb(0.1, 0.09, flesh);
    limb(0.09, 0.07, flesh);
    limb(0.15, 0.11, this.skin);
    limb(0.11, 0.09, this.skin);
    limb(0.15, 0.11, this.skin);
    limb(0.11, 0.09, this.skin);

    this.head = MeshBuilder.CreateSphere('head', { diameter: 0.34, segments: 12 }, scene);
    this.head.material = flesh;
    this.head.parent = this.root;
    outline(this.head);

    // Spiked anime hair: the fighter's silhouette until real models arrive.
    this.hairGroup = new TransformNode('hair', scene);
    this.hairGroup.parent = this.root;
    for (let i = 0; i < 7; i++) {
      const spike = MeshBuilder.CreateCylinder('spike', { height: 0.3, diameterTop: 0, diameterBottom: 0.15, tessellation: 5 }, scene);
      spike.material = hairSkin;
      spike.parent = this.hairGroup;
      const a = (i / 7) * Math.PI * 2;
      spike.position.set(Math.sin(a) * 0.1, 0.14, Math.cos(a) * 0.1 - 0.03);
      spike.rotation.set(Math.cos(a) * 0.9 - 0.3, 0, -Math.sin(a) * 0.9);
      outline(spike, 0.01);
    }

    const steel = new StandardMaterial('steel', scene);
    steel.diffuseColor = Color3.FromHexString(bladeColor);
    steel.emissiveColor = Color3.FromHexString(bladeColor).scale(0.55);
    steel.specularColor = new Color3(1, 1, 1);
    this.sword = MeshBuilder.CreateCylinder('blade', { height: 1, diameterTop: 0.012, diameterBottom: 0.05, tessellation: 4 }, scene);
    this.sword.material = steel;
    this.sword.rotationQuaternion = this.identity();
    outline(this.sword, 0.008);
  }

  private identity() {
    return new Vector3(0, 0, 0).toQuaternion();
  }

  hurt(): void {
    this.flash = 1;
  }

  update(f: Fighter, time: number, dtMs: number, stride: number): void {
    this.flash = Math.max(0, this.flash - dtMs / 160);
    this.skin.diffuseColor = Color3.Lerp(this.skinColor, Color3.White(), this.flash);
    this.root.position.set(f.x, 0, f.z);
    this.root.rotation.y = f.yaw;

    const stance: Stance =
      f.state === 'HITSTUN' ? 'stun' : f.state === 'DODGE' ? 'dash' : f.state === 'GUARD' || f.state === 'PARRY' ? 'block' : isSwinging(f) ? 'swing' : Math.hypot(f.pushX, f.pushZ) > 3 ? 'stun' : stride > 0 ? 'run' : 'idle';
    const swing = f.attack ? Math.min(1, f.elapsedMs / (f.attack.startupMs + f.attack.activeMs + f.attack.recoveryMs)) : 0;
    const p = poseFor({ stance, time: time / 1000, stride: f.state === 'IDLE' ? stride : 0, swing, combo: f.combo, vy: 0 });

    if (f.state === 'DEFEATED') this.fallen = Math.min(1, this.fallen + dtMs / 420);
    this.root.rotation.x = -this.fallen * (Math.PI / 2);
    this.root.position.y = this.fallen * 0.2;

    const L = (x: number, y: number, side: number) => new Vector3(side, y, x);
    const side = 0.13;
    const shoulderY = p.neck.y - 0.05;
    const neck = L(p.neck.x, p.neck.y, 0);
    const hip = L(p.hip.x, p.hip.y, 0);
    span(this.limbs[0], neck, hip);
    span(this.limbs[3], L(p.neck.x, shoulderY, -side), L(p.elbowB.x, p.elbowB.y, -side));
    span(this.limbs[4], L(p.elbowB.x, p.elbowB.y, -side), L(p.handB.x, p.handB.y, -side));
    span(this.limbs[5], L(p.hip.x, p.hip.y, side * 0.7), L(p.kneeF.x, p.kneeF.y, side * 0.7));
    span(this.limbs[6], L(p.kneeF.x, p.kneeF.y, side * 0.7), L(p.footF.x, p.footF.y, side * 0.7));
    span(this.limbs[7], L(p.hip.x, p.hip.y, -side * 0.7), L(p.kneeB.x, p.kneeB.y, -side * 0.7));
    span(this.limbs[8], L(p.kneeB.x, p.kneeB.y, -side * 0.7), L(p.footB.x, p.footB.y, -side * 0.7));
    this.head.position.copyFrom(L(p.head.x, p.head.y, 0));
    this.hairGroup.position.copyFrom(this.head.position);

    // The sword arm follows the same blade the combat rules use, so what you see is what hits.
    this.root.computeWorldMatrix(true);
    const world = this.root.getWorldMatrix();
    const blade = this.bladeNow(f, p);
    this.rootPoint.set(blade.root.x, blade.root.y, blade.root.z);
    this.tipPoint.set(blade.tip.x, blade.tip.y, blade.tip.z);
    span(this.sword, this.rootPoint, this.tipPoint);

    const inverse = world.clone().invert();
    const handLocal = Vector3.TransformCoordinates(this.rootPoint, inverse);
    const shoulder = L(p.neck.x, shoulderY, side);
    const elbow = shoulder.add(handLocal).scaleInPlace(0.5);
    elbow.y -= 0.1;
    elbow.x += 0.08;
    span(this.limbs[1], shoulder, elbow);
    span(this.limbs[2], elbow, handLocal);
  }

  /** The blade's place: straight from the combat data mid-swing, a ready stance otherwise. */
  private bladeNow(f: Fighter, p: ReturnType<typeof poseFor>): Blade {
    const fx = Math.sin(f.yaw);
    const fz = Math.cos(f.yaw);
    const rx = fz;
    const rz = -fx;
    const hx = f.x + fx * p.handF.x + rx * 0.16;
    const hz = f.z + fz * p.handF.x + rz * 0.16;
    const lean = f.state === 'GUARD' || f.state === 'PARRY' ? 1.45 : REST_SWORD_UP;
    const rest: Blade = {
      root: { x: hx, y: p.handF.y, z: hz },
      tip: { x: hx + fx * Math.cos(lean) * this.bladeLength, y: p.handF.y + Math.sin(lean) * this.bladeLength, z: hz + fz * Math.cos(lean) * this.bladeLength },
    };
    if (!f.attack || !isSwinging(f)) return rest;
    const a = f.attack;
    const live = bladeAt(f, a, f.elapsedMs);
    const k = f.state === 'STARTUP' ? f.elapsedMs / a.startupMs : f.state === 'ACTIVE' ? 1 : 1 - (f.elapsedMs - a.startupMs - a.activeMs) / a.recoveryMs;
    const blend = (u: V3, v: V3): V3 => ({ x: u.x + (v.x - u.x) * k, y: u.y + (v.y - u.y) * k, z: u.z + (v.z - u.z) * k });
    return { root: blend(rest.root, live.root), tip: blend(rest.tip, live.tip) };
  }
}

/** A streak behind the blade: a short ribbon, reused for the whole fight. */
class Trail {
  private readonly mesh: Mesh;
  private readonly data = new VertexData();
  private readonly points: number[][] = [];

  constructor(scene: Scene, color: string, private readonly length = 12) {
    this.mesh = new Mesh('trail', scene);
    const material = new StandardMaterial('trail', scene);
    material.emissiveColor = Color3.FromHexString(color);
    material.disableLighting = true;
    material.alpha = 0.7;
    material.backFaceCulling = false;
    this.mesh.material = material;
    this.mesh.isPickable = false;
    const indices: number[] = [];
    for (let i = 0; i < length - 1; i++) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    this.data.positions = new Array(length * 6).fill(0);
    this.data.indices = indices;
    this.data.applyToMesh(this.mesh, true);
    this.mesh.alwaysSelectAsActiveMesh = true;
  }

  update(root: Vector3, tip: Vector3, cutting: boolean): void {
    if (cutting) this.points.unshift([root.x * 0.45 + tip.x * 0.55, root.y * 0.45 + tip.y * 0.55, root.z * 0.45 + tip.z * 0.55, tip.x, tip.y, tip.z]);
    else this.points.pop();
    if (this.points.length > this.length) this.points.length = this.length;
    this.mesh.isVisible = this.points.length > 1;
    if (!this.mesh.isVisible) return;
    const out = this.data.positions as number[];
    for (let i = 0; i < this.length; i++) {
      const s = this.points[Math.min(i, this.points.length - 1)];
      for (let j = 0; j < 6; j++) out[i * 6 + j] = s[j];
    }
    this.mesh.updateVerticesData('position', out);
  }
}

function dotTexture(scene: Scene): DynamicTexture {
  const t = new DynamicTexture('dot', 64, scene, false);
  const g = t.getContext() as unknown as CanvasRenderingContext2D;
  const fill = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  fill.addColorStop(0, 'rgba(255,255,255,1)');
  fill.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = fill;
  g.fillRect(0, 0, 64, 64);
  t.update();
  t.hasAlpha = true;
  return t;
}

function burstSystem(scene: Scene, texture: DynamicTexture, capacity: number, a: string, b: string, additive: boolean): ParticleSystem {
  const ps = new ParticleSystem('burst', capacity, scene);
  ps.particleTexture = texture;
  ps.emitter = Vector3.Zero();
  ps.color1 = Color4.FromColor3(Color3.FromHexString(a));
  ps.color2 = Color4.FromColor3(Color3.FromHexString(b));
  ps.colorDead = new Color4(0, 0, 0, 0);
  ps.minSize = 0.04;
  ps.maxSize = 0.14;
  ps.minLifeTime = 0.14;
  ps.maxLifeTime = 0.42;
  ps.minEmitPower = 2;
  ps.maxEmitPower = 7;
  ps.gravity = new Vector3(0, -12, 0);
  ps.direction1 = new Vector3(-1, 0.3, -1);
  ps.direction2 = new Vector3(1, 1.4, 1);
  ps.blendMode = additive ? ParticleSystem.BLENDMODE_ADD : ParticleSystem.BLENDMODE_STANDARD;
  ps.emitRate = 0;
  ps.manualEmitCount = 0;
  ps.start();
  return ps;
}

/** The whole fight. React only starts, pauses and disposes it; it never rerenders per frame. */
export class FightStage {
  private readonly engine: Engine;
  private readonly scene: Scene;
  private readonly camera: FreeCamera;
  private readonly me: Fighter;
  private readonly foe: Fighter;
  private readonly duel: Duel;
  private readonly brain: Brain;
  private controllers: PhysicsCharacterController[] = [];
  private puppets: (Puppet | RealFighter)[] = [];
  private trails: Trail[] = [];
  private readonly pillars: Pillar[] = [];
  private sparks!: ParticleSystem;
  private energy!: ParticleSystem;
  private blood: ParticleSystem | null = null;
  private bolts = new Map<object, Mesh>();
  private glow: GlowLayer | null = null;
  private shadows: ShadowGenerator | null = null;
  private fighting = false;
  private paused = false;
  private spareMs = 0;
  private timeMs = 0;
  private freezeMs = 0;
  private endInMs = 0;
  private ended = false;
  private enrageCalled = false;
  private landed = 0;
  private shake = 0;
  private strides = [0, 0];
  private moved = [false, false];
  private camYaw = 0;
  private camDistance = 7;
  private slowFrames = 0;
  private scale = 1;
  private readonly stopAway: () => void;
  private readonly onResize = () => this.engine.resize();
  private disposed = false;

  static async create(o: FightOptions): Promise<FightStage> {
    const plugin = await loadHavok();
    const stage = new FightStage(o, plugin);
    await stage.loadFighters();
    stage.engine.runRenderLoop(stage.frame);
    return stage;
  }

  /** Real models where their files exist. A file that won't load falls back to a stand-in, so the fight still runs. */
  private async loadFighters(): Promise<void> {
    const { hero, chapter } = this.o;
    const v = chapter.foe;
    const files: FighterFiles = (await readManifest()) ?? { fighters: {}, clips: {} };
    // Lets a model be tried without installing it: ?fighter=<url>, on a development build only.
    const trial = import.meta.env.DEV ? new URLSearchParams(location.search).get('fighter') : null;
    const url = (id: string) => trial ?? (files.fighters[id] ? fileUrl(files.fighters[id]) : null);
    const make = async (id: string, color: string, hair: string, blade: string, length: number) => {
      const file = url(id);
      if (file) {
        try {
          return await RealFighter.create(this.scene, files, file, length, blade);
        } catch (e) {
          console.error(`Fighter ${id} failed to load`, e);
        }
      }
      return new Puppet(this.scene, color, hair, blade, length, this.shadows);
    };
    this.puppets = await Promise.all([make(hero.id, hero.color, hero.hair, hero.bladeColor, hero.bladeLength), make(v.model, v.color, v.hair, v.bladeColor, v.spec.bladeLength)]);
    if (import.meta.env.DEV) (window as unknown as { __fighters: unknown }).__fighters = this.puppets;
  }

  private constructor(private readonly o: FightOptions, plugin: HavokPlugin) {
    const low = o.quality === 'low';
    this.engine = new Engine(o.canvas, !low, { stencil: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' }, false);
    this.scale = o.quality === 'high' ? 1 : o.quality === 'medium' ? 1.25 : 1.6;
    this.engine.setHardwareScalingLevel(this.scale / Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new Scene(this.engine);
    this.scene.skipPointerMovePicking = true;
    this.scene.enablePhysics(GRAVITY, plugin);

    this.camera = new FreeCamera('combat', new Vector3(0, 2.4, -9), this.scene);
    this.camera.fov = 0.72;
    this.camera.minZ = 0.2;
    this.camera.maxZ = 120;
    this.camera.inputs.clear();

    const look = ARENAS[o.chapter.arena];
    this.buildArena(look);

    this.me = newFighter(heroSpec(o.hero), 0, -4, 0);
    this.foe = newFighter(villainSpec(o.chapter.foe), 0, 4, Math.PI);
    this.duel = new Duel([this.me, this.foe]);
    this.brain = new Brain({ ...o.chapter.foe.ai });

    for (const f of [this.me, this.foe]) {
      this.controllers.push(new PhysicsCharacterController(new Vector3(f.x, CAPSULE_HEIGHT / 2 + 0.05, f.z), { capsuleHeight: CAPSULE_HEIGHT, capsuleRadius: CAPSULE_RADIUS }, this.scene));
    }
    const v = o.chapter.foe;
    this.trails = [new Trail(this.scene, o.hero.bladeColor), new Trail(this.scene, v.bladeColor)];

    const dot = dotTexture(this.scene);
    const cap = low ? 60 : 160;
    this.sparks = burstSystem(this.scene, dot, cap, '#fff0b0', '#ff9a3a', true);
    this.energy = burstSystem(this.scene, dot, cap, o.hero.bladeColor, '#ffffff', true);
    if (o.blood) this.blood = burstSystem(this.scene, dot, cap, '#b3101a', '#6a0a12', false);

    if (o.quality !== 'low') {
      this.glow = new GlowLayer('glow', this.scene, { mainTextureFixedSize: 256, blurKernelSize: 24 });
      this.glow.intensity = 0.5;
    }

    this.stopAway = onAwayChange((away) => {
      if (away && this.fighting && !this.ended) o.onAway();
    });
    window.addEventListener('resize', this.onResize);
  }

  private buildArena(look: Look): void {
    const { scene } = this;
    const sky = Color3.FromHexString(look.sky);
    scene.clearColor = Color4.FromColor3(sky);
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = Color3.FromHexString(look.haze);
    scene.fogStart = 16;
    scene.fogEnd = 46;

    const fill = new HemisphericLight('fill', UP, scene);
    fill.intensity = 0.75;
    fill.groundColor = Color3.FromHexString(look.haze).scale(0.5);
    const sun = new DirectionalLight('sun', new Vector3(-0.5, -1, 0.45), scene);
    sun.position = new Vector3(8, 16, -8);
    sun.diffuse = Color3.FromHexString(look.sun);
    sun.intensity = 1.5;
    if (this.o.quality !== 'low') {
      this.shadows = new ShadowGenerator(this.o.quality === 'high' ? 1024 : 512, sun);
      this.shadows.useBlurExponentialShadowMap = true;
      this.shadows.blurKernel = 12;
    }

    const stone = new CellMaterial('stone', scene);
    stone.diffuseColor = Color3.FromHexString(look.stone);
    stone.computeHighLevel = true;
    const floorSkin = new StandardMaterial('floor', scene);
    floorSkin.diffuseColor = Color3.FromHexString(look.floor);
    floorSkin.specularColor = Color3.Black();

    const floor = MeshBuilder.CreateDisc('floor', { radius: 60, tessellation: 48 }, scene);
    floor.rotation.x = Math.PI / 2;
    floor.material = floorSkin;
    floor.receiveShadows = true;
    const ring = MeshBuilder.CreateTorus('ring', { diameter: ARENA_RADIUS * 2, thickness: 0.09, tessellation: 64 }, scene);
    ring.position.y = 0.02;
    const glowLine = new StandardMaterial('line', scene);
    glowLine.emissiveColor = Color3.FromHexString(look.sun);
    glowLine.disableLighting = true;
    ring.material = glowLine;

    const ground = MeshBuilder.CreateBox('ground', { width: 60, height: 1, depth: 60 }, scene);
    ground.position.y = -0.5;
    ground.isVisible = false;
    new PhysicsAggregate(ground, PhysicsShapeType.BOX, { mass: 0 }, scene);

    // The edge of the arena: a ring of walls nobody sees.
    const sides = 20;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const wall = MeshBuilder.CreateBox('wall', { width: 4.2, height: 5, depth: 0.6 }, scene);
      wall.position.set(Math.sin(a) * (ARENA_RADIUS + 0.3), 2.5, Math.cos(a) * (ARENA_RADIUS + 0.3));
      wall.rotation.y = a;
      wall.isVisible = false;
      new PhysicsAggregate(wall, PhysicsShapeType.BOX, { mass: 0 }, scene);
    }

    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
      const radius = 0.75;
      const pillar = MeshBuilder.CreateCylinder('pillar', { height: 7, diameter: radius * 2, tessellation: 8 }, scene);
      pillar.position.set(Math.sin(a) * 7.6, 3.5, Math.cos(a) * 7.6);
      pillar.material = stone;
      pillar.renderOutline = true;
      pillar.outlineWidth = 0.03;
      pillar.outlineColor = new Color3(0.03, 0.03, 0.05);
      pillar.receiveShadows = true;
      this.shadows?.addShadowCaster(pillar);
      new PhysicsAggregate(pillar, PhysicsShapeType.CYLINDER, { mass: 0 }, scene);
      this.pillars.push({ x: pillar.position.x, z: pillar.position.z, radius });
    }

    // Loose crates: fighters barge through them, and they're only ever decoration.
    for (let i = 0; i < 5; i++) {
      const a = 0.4 + i * 1.25;
      const crate = MeshBuilder.CreateBox('crate', { size: 0.7 }, scene);
      crate.position.set(Math.sin(a) * 9.4, 0.36, Math.cos(a) * 9.4);
      crate.material = stone;
      crate.renderOutline = true;
      crate.outlineWidth = 0.02;
      crate.outlineColor = new Color3(0.03, 0.03, 0.05);
      this.shadows?.addShadowCaster(crate);
      new PhysicsAggregate(crate, PhysicsShapeType.BOX, { mass: 8, friction: 0.6, restitution: 0.1 }, scene);
    }

    // Far-off shapes give the arena a skyline.
    const far = new StandardMaterial('far', scene);
    far.diffuseColor = Color3.FromHexString(look.stone).scale(0.5);
    far.specularColor = Color3.Black();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const h = 8 + ((i * 37) % 11);
      const peak = MeshBuilder.CreateCylinder('peak', { height: h, diameterTop: 0, diameterBottom: 9 + (i % 4) * 2, tessellation: 5 }, scene);
      peak.position.set(Math.sin(a) * 34, h / 2, Math.cos(a) * 34);
      peak.material = far;
      peak.freezeWorldMatrix();
      peak.isPickable = false;
    }
  }

  begin(): void {
    this.fighting = true;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.spareMs = 0;
  }

  private playerCommand(): Command {
    const i = this.o.input;
    const cmd = noCommand();
    if (!this.fighting || this.ended) return cmd;
    const forwardX = Math.sin(this.camYaw);
    const forwardZ = Math.cos(this.camYaw);
    const move = stickToWorld(i.stickX, i.stickY, forwardX, forwardZ);
    cmd.moveX = move.x;
    cmd.moveZ = move.z;
    cmd.guard = i.guard;
    cmd.light = i.light;
    cmd.heavy = i.heavy;
    cmd.dodge = i.dodge;
    cmd.special = i.special;
    i.light = false;
    i.heavy = false;
    i.dodge = false;
    i.special = false;
    return cmd;
  }

  private fixedStep(): void {
    const { me, foe, duel } = this;
    const c1 = this.playerCommand();
    const c2 = this.fighting ? this.brain.think(foe, me, FIXED_MS) : noCommand();
    // Lock-on: fighters turn to face each other, unless committed to something.
    for (const [f, other] of [[me, foe], [foe, me]] as const) {
      if (f.state === 'IDLE' || f.state === 'GUARD' || f.state === 'PARRY' || f.state === 'STARTUP') f.yaw = Math.atan2(other.x - f.x, other.z - f.z);
    }
    separate(me, foe);
    const seen = duel.events.length;
    advance(me, c1, FIXED_MS, duel.events);
    advance(foe, c2, FIXED_MS, duel.events);

    [me, foe].forEach((f, i) => {
      const cmd = i === 0 ? c1 : c2;
      const v = wantedVelocity(f, cmd);
      const ctrl = this.controllers[i];
      const dt = FIXED_MS / 1000;
      const support = ctrl.checkSupport(dt, DOWN);
      const y = ctrl.getVelocity().y;
      ctrl.setVelocity(new Vector3(v.x, y, v.z));
      ctrl.integrate(dt, support, GRAVITY);
      const at = ctrl.getPosition();
      f.x = at.x;
      f.z = at.z;
      settlePush(f, FIXED_MS);
      const speed = Math.hypot(v.x, v.z);
      this.moved[i] = speed > 0.4;
      this.strides[i] += (speed * dt) / 2.1;
    });

    duel.resolve(FIXED_MS);
    this.play(duel.events.slice(seen));
    duel.events.length = 0;

    if (this.brain.enraged && !this.enrageCalled) {
      this.enrageCalled = true;
      this.o.onCall('The void awakens!');
      this.shake = 0.3;
      this.emit(this.energy, { x: foe.x, y: 1.2, z: foe.z }, 60);
      sfx.warp();
    }

    if (this.endInMs > 0) {
      this.endInMs -= FIXED_MS;
      if (this.endInMs <= 0 && !this.ended) {
        this.ended = true;
        this.o.onEnd(foe.state === 'DEFEATED');
      }
    }
  }

  private emit(ps: ParticleSystem, at: V3, count: number): void {
    (ps.emitter as Vector3).set(at.x, at.y, at.z);
    ps.manualEmitCount = this.o.quality === 'low' ? Math.ceil(count / 2) : count;
  }

  /** Feedback in the handbook's order: the flash at contact, the burst after it, then camera and sound. */
  private play(events: CombatEvent[]): void {
    for (const e of events) {
      if (e.type === 'AttackStarted') sfx.slash(e.attack.weight !== 'light');
      else if (e.type === 'Blocked' || e.type === 'Parried' || e.type === 'GuardBroken' || e.type === 'Clash') {
        this.emit(this.sparks, e.at, e.type === 'Blocked' ? 14 : 34);
        sfx.clang(e.type !== 'Blocked');
        this.freezeMs = e.type === 'Blocked' ? 25 : 90;
        this.shake = Math.max(this.shake, e.type === 'Blocked' ? 0.04 : 0.11);
        buzz(12);
        if (e.type === 'Parried') this.o.onCall('Parry!');
        if (e.type === 'GuardBroken') this.o.onCall('Guard broken!');
        if (e.type === 'Clash') this.o.onCall('Clash!');
      } else if (e.type === 'Dodged') {
        if (e.by === this.me.spec.id) this.o.onCall('Dodged!');
      } else if (e.type === 'HitConfirmed' || e.type === 'CharacterDefeated') {
        const on = e.on === this.me.spec.id ? 0 : 1;
        if (on === 1) this.landed += 1;
        this.puppets[on].hurt();
        const heavy = e.type === 'CharacterDefeated' || e.attack.weight !== 'light';
        this.emit(this.energy, e.at, heavy ? 40 : 18);
        if (this.blood) this.emit(this.blood, e.at, heavy ? 44 : 20);
        sfx.thud(heavy);
        buzz(heavy ? 40 : 18);
        this.freezeMs = heavy ? 110 : 50;
        this.shake = Math.max(this.shake, heavy ? 0.2 : 0.09);
        if (e.type === 'CharacterDefeated') {
          this.endInMs = END_AFTER_MS;
          this.shake = 0.32;
          sfx.crash();
          this.o.onCall(on === 1 ? 'Victory' : 'Defeated');
        }
      }
    }
  }

  private frame = () => {
    if (this.disposed) return;
    const frameMs = this.engine.getDeltaTime();
    if (this.paused) {
      this.scene.render();
      return;
    }
    this.watchSpeed(frameMs);
    this.timeMs += frameMs;
    if (this.freezeMs > 0) this.freezeMs -= frameMs;
    else {
      const due = stepsDue(this.spareMs, frameMs, FIXED_MS);
      this.spareMs = due.spareMs;
      for (let i = 0; i < due.steps; i++) this.fixedStep();
    }
    this.draw(frameMs);
    this.scene.render();
  };

  /** Steps the picture down, not the game, if this phone can't keep up. */
  private watchSpeed(frameMs: number): void {
    this.slowFrames = frameMs > SLOW_FRAME_MS ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 1);
    if (this.slowFrames < 45) return;
    this.slowFrames = 0;
    if (this.glow) {
      this.glow.dispose();
      this.glow = null;
    } else if (this.scale < 2) {
      this.scale += 0.25;
      this.engine.setHardwareScalingLevel(this.scale / Math.min(window.devicePixelRatio || 1, 2));
    } else if (this.scene.shadowsEnabled) this.scene.shadowsEnabled = false;
  }

  private draw(frameMs: number): void {
    const { me, foe } = this;
    [me, foe].forEach((f, i) => {
      const puppet = this.puppets[i];
      puppet.update(f, this.timeMs, frameMs, this.moved[i] ? this.strides[i] : 0);
      this.trails[i].update(puppet.rootPoint, puppet.tipPoint, f.state === 'ACTIVE' || f.state === 'DODGE');
    });

    for (const bolt of this.duel.bolts) {
      let mesh = this.bolts.get(bolt);
      if (!mesh) {
        mesh = MeshBuilder.CreateTorus('bolt', { diameter: 1.3, thickness: 0.14, tessellation: 16 }, this.scene);
        const skin = new StandardMaterial('bolt', this.scene);
        skin.emissiveColor = Color3.FromHexString(bolt.owner === me ? this.o.hero.bladeColor : this.o.chapter.foe.bladeColor);
        skin.disableLighting = true;
        mesh.material = skin;
        mesh.rotation.x = Math.PI / 2;
        this.bolts.set(bolt, mesh);
      }
      mesh.position.set(bolt.x, 1.1, bolt.z);
    }
    for (const [bolt, mesh] of this.bolts) {
      if (!this.duel.bolts.includes(bolt as never)) {
        mesh.dispose(false, true);
        this.bolts.delete(bolt);
      }
    }

    // Lock-on: behind the player, looking through them at the enemy.
    const dx = foe.x - me.x;
    const dz = foe.z - me.z;
    const gap = Math.hypot(dx, dz) || 0.001;
    const wantYaw = Math.atan2(dx, dz);
    const turn = Math.atan2(Math.sin(wantYaw - this.camYaw), Math.cos(wantYaw - this.camYaw));
    this.camYaw += turn * Math.min(1, (frameMs / 1000) * 5);
    const backX = -Math.sin(this.camYaw);
    const backZ = -Math.cos(this.camYaw);
    const want = lockOnDistance(gap, me.spec.bladeLength);
    const allowed = clearDistance(me.x, me.z, backX, backZ, want, this.pillars);
    this.camDistance += (allowed - this.camDistance) * Math.min(1, (frameMs / 1000) * (allowed < this.camDistance ? 14 : 3));
    this.shake *= Math.exp(-frameMs / 110);
    const jitter = () => (Math.random() - 0.5) * this.shake;
    // Over the shoulder, so the player never hides the enemy.
    const sideX = -backZ * SHOULDER;
    const sideZ = backX * SHOULDER;
    this.camera.position.set(me.x + backX * this.camDistance + sideX + jitter(), 2.5 + jitter(), me.z + backZ * this.camDistance + sideZ + jitter());
    this.camera.setTarget(new Vector3(me.x + dx * 0.5, 1.05, me.z + dz * 0.5));

    this.o.onHud({
      hp: me.hp / me.spec.maxHp,
      foeHp: foe.hp / foe.spec.maxHp,
      stamina: me.stamina / 100,
      guard: me.guard / 100,
      energy: me.energy / 100,
      combo: me.attack?.weight === 'light' && isSwinging(me) ? me.combo + 1 : 0,
      guarding: me.state === 'GUARD' || me.state === 'PARRY',
      stunned: me.state === 'HITSTUN' || me.state === 'DEFEATED',
      landed: this.landed,
    });
  }

  dispose(): void {
    this.disposed = true;
    this.stopAway();
    window.removeEventListener('resize', this.onResize);
    this.engine.stopRenderLoop(this.frame);
    this.scene.dispose();
    this.engine.dispose();
  }
}
