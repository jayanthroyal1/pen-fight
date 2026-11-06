import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Node } from '@babylonjs/core/node';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Scene } from '@babylonjs/core/scene';
import '@babylonjs/loaders/glTF/2.0';
import { slotFor } from '../../scripts/clipSlots.mjs';
import { totalMs } from './attacks';
import { isSwinging, type Fighter } from './combat';

/**
 * A real fighter: a rigged model playing real animation clips. Clips are timed
 * to the combat windows, so a swing lasts exactly as long as the rules say. The
 * combat rules still decide every hit; this only shows them.
 */

export interface FighterFiles {
  fighters: Record<string, string>;
  clips: Record<string, string>;
}

const BASE = `${import.meta.env.BASE_URL}fighters/`;
const HEIGHT = 1.8;
const BLEND = 0.12;
/** How the sword sits in Mixamo's right hand bone, in radians. */
const SWORD_GRIP = { x: -Math.PI / 2, y: 0, z: 0 };

/** The private store's manifest, when there is one. Otherwise models come from the local folder. */
const HOSTED = (import.meta.env.VITE_FIGHTERS_MANIFEST_URL as string | undefined)?.trim();

export async function readManifest(): Promise<FighterFiles | null> {
  try {
    const response = await fetch(HOSTED || `${BASE}manifest.json`);
    return response.ok ? ((await response.json()) as FighterFiles) : null;
  } catch {
    return null;
  }
}

/** A file's address: the store gives whole links, the local folder gives names. */
export const fileUrl = (file: string) => (/^https?:/.test(file) ? file : `${BASE}${file}`);

/** Mixamo's skeletons name a bone `mixamorig:Hips` or `mixamorig_Hips`, depending on the route it took. */
export const boneName = (name: string) => name.replace(/^.*mixamorig\d*[:_]?/i, '').toLowerCase();

const load = (url: string, scene: Scene) => LoadAssetContainerAsync(url, scene, { pluginExtension: '.glb' });

type Slot = string;

/** Which way a fighter is moving relative to where they face. */
export function moveSlot(stepX: number, stepZ: number, yaw: number): Slot {
  const ahead = stepX * Math.sin(yaw) + stepZ * Math.cos(yaw);
  const right = stepX * Math.cos(yaw) - stepZ * Math.sin(yaw);
  if (Math.abs(right) > Math.abs(ahead)) return right > 0 ? 'strafeRight' : 'strafeLeft';
  return ahead < 0 ? 'back' : 'run';
}

export class RealFighter {
  readonly tipPoint = new Vector3();
  readonly rootPoint = new Vector3();
  private readonly root: TransformNode;
  private readonly bones = new Map<string, Node>();
  private readonly groups = new Map<Slot, AnimationGroup>();
  private playing: AnimationGroup | null = null;
  private slot: Slot = '';
  private lastAttack: string | null = null;
  private hips: TransformNode | null = null;
  private restX = 0;
  private restZ = 0;
  private flash = 0;
  private readonly tip: TransformNode;
  private readonly hilt: TransformNode;
  private readonly meshes: Mesh[] = [];

  private constructor(
    private readonly scene: Scene,
    root: TransformNode,
    meshes: Mesh[],
    private readonly bladeLength: number,
    bladeColor: string,
  ) {
    this.root = root;
    this.meshes = meshes;
    for (const n of root.getDescendants(false)) {
      const key = boneName(n.name);
      if (!this.bones.has(key)) this.bones.set(key, n);
    }
    this.hips = (this.bones.get('hips') as TransformNode) ?? null;
    if (this.hips) {
      this.restX = this.hips.position.x;
      this.restZ = this.hips.position.z;
    }

    const hand = this.bones.get('righthand') as TransformNode | undefined;
    this.hilt = new TransformNode('hilt', scene);
    this.tip = new TransformNode('tip', scene);
    this.hilt.parent = hand ?? root;
    this.tip.parent = this.hilt;
    this.buildSword(bladeColor);

    // Clips carry the body forward; movement belongs to the character controller.
    scene.onAfterAnimationsObservable.add(this.pin);
  }

  private buildSword(color: string): void {
    const { scene } = this;
    const steel = new StandardMaterial('steel', scene);
    steel.diffuseColor = Color3.FromHexString(color);
    steel.specularColor = new Color3(1, 1, 1);
    steel.emissiveColor = Color3.FromHexString(color).scale(0.35);
    const dark = new StandardMaterial('grip', scene);
    dark.diffuseColor = new Color3(0.08, 0.07, 0.07);
    const length = this.bladeLength;
    const blade = MeshBuilder.CreateBox('blade', { width: 0.024, height: length, depth: 0.075 }, scene);
    blade.position.y = length / 2 + 0.1;
    blade.material = steel;
    const guard = MeshBuilder.CreateBox('guard', { width: 0.05, height: 0.03, depth: 0.2 }, scene);
    guard.position.y = 0.09;
    guard.material = dark;
    const grip = MeshBuilder.CreateCylinder('grip', { height: 0.2, diameter: 0.035, tessellation: 8 }, scene);
    grip.material = dark;
    for (const m of [blade, guard, grip]) m.parent = this.hilt;
    this.tip.position.y = length + 0.1;
  }

  private fitSwordToHand(): void {
    // Bones are in the model's own units, and the sword is sized in metres.
    const hand = this.hilt.parent as TransformNode;
    this.root.getDescendants(false).forEach((n) => n.computeWorldMatrix(true));
    const world = new Vector3();
    hand.getWorldMatrix().decompose(world);
    const unit = 1 / (Math.abs(world.y) || 1);
    this.hilt.scaling.setAll(unit);
    // Held in the fist: out across the palm, as Mixamo's sword clips expect.
    this.hilt.rotation.set(SWORD_GRIP.x, SWORD_GRIP.y, SWORD_GRIP.z);
    this.hilt.position.set(0, 0.08 * unit, 0.02 * unit);
  }

  private pin = () => {
    if (!this.hips) return;
    this.hips.position.x = this.restX;
    this.hips.position.z = this.restZ;
  };

  static async create(scene: Scene, files: FighterFiles, url: string, bladeLength: number, bladeColor: string): Promise<RealFighter> {
    const container = await load(url, scene);
    const made = container.instantiateModelsToScene((name) => name, false, { doNotInstantiate: true });
    const root = new TransformNode('fighter', scene);
    for (const n of made.rootNodes) n.parent = root;
    try {
      return await RealFighter.dress(scene, files, root, made.animationGroups, bladeLength, bladeColor);
    } catch (e) {
      // Leave nothing half-built standing in the arena.
      root.dispose(false, true);
      throw e;
    }
  }

  private static async dress(scene: Scene, files: FighterFiles, root: TransformNode, own: AnimationGroup[], bladeLength: number, bladeColor: string): Promise<RealFighter> {
    const meshes = root.getChildMeshes(false) as Mesh[];
    for (const m of meshes) {
      m.alwaysSelectAsActiveMesh = true;
      m.renderOutline = true;
      m.outlineWidth = 0.01;
      m.outlineColor = new Color3(0.03, 0.03, 0.05);
    }
    const me = new RealFighter(scene, root, meshes, bladeLength, bladeColor);
    me.fitHeight();
    me.fitSwordToHand();
    own.forEach((g) => {
      g.stop();
      me.adopt(g);
    });
    await Promise.all(
      Object.entries(files.clips).map(async ([slot, file]) => {
        const clip = await load(fileUrl(file), scene);
        const source = clip.animationGroups[0];
        if (source) me.retarget(slot, source);
      }),
    );
    me.play('idle', true);
    return me;
  }

  /** Scales the model to fighter height, from its own head and feet. */
  private fitHeight(): void {
    const head = (this.bones.get('headtop_end') ?? this.bones.get('head')) as TransformNode | undefined;
    if (!head) return;
    this.root.computeWorldMatrix(true);
    this.root.getDescendants(false).forEach((n) => n.computeWorldMatrix(true));
    const top = head.getAbsolutePosition().y;
    if (top > 0.01) this.root.scaling.setAll(HEIGHT / top);
  }

  /** Clips that came inside the model file, sorted by their names. */
  private adopt(group: AnimationGroup): void {
    const slot = slotFor(group.name);
    if (slot && !this.groups.has(slot)) this.groups.set(slot, group);
  }

  /** Points a clip from another file at this fighter's own bones, which share Mixamo's names. */
  private retarget(slot: Slot, source: AnimationGroup): void {
    const group = new AnimationGroup(slot, this.scene);
    for (const { animation, target } of source.targetedAnimations) {
      // Some models have fewer bones, such as no fingers: those tracks are simply left out.
      const bone = this.bones.get(boneName((target as Node).name));
      if (bone) group.addTargetedAnimation(animation, bone);
    }
    group.normalize(source.from, source.to);
    this.groups.set(slot, group);
  }

  private play(slot: Slot, loop: boolean, lastsMs?: number): void {
    const group = this.groups.get(slot) ?? this.groups.get(slot.replace(/\d$/, '1')) ?? this.groups.get('idle');
    if (!group) return;
    if (this.slot === slot && this.playing === group && loop) return;
    this.playing?.stop();
    this.slot = slot;
    this.playing = group;
    group.enableBlending = true;
    group.blendingSpeed = BLEND;
    const seconds = (group.to - group.from) / 60;
    const speed = lastsMs ? Math.max(0.2, seconds / (lastsMs / 1000)) : 1;
    group.start(loop, speed, group.from, group.to, false);
  }

  hurt(): void {
    this.flash = 1;
  }

  /** Same shape as the stand-in fighter, so the stage needn't care which it has. */
  update(f: Fighter, _timeMs: number, dtMs: number, stride: number): void {
    const stepX = f.x - this.root.position.x;
    const stepZ = f.z - this.root.position.z;
    this.root.position.set(f.x, 0, f.z);
    this.root.rotation.y = f.yaw;
    this.flash = Math.max(0, this.flash - dtMs / 160);
    for (const m of this.meshes) m.outlineColor.set(this.flash, this.flash, this.flash);

    if (f.state === 'DEFEATED') this.play('death', false);
    else if (f.state === 'HITSTUN') this.play('hit', false, Math.max(280, f.stunMs));
    else if (f.state === 'DODGE') this.play('dodge', false, 440);
    else if (f.state === 'GUARD' || f.state === 'PARRY') this.play('guard', true);
    else if (f.attack && isSwinging(f)) {
      if (this.lastAttack !== f.attack.id) {
        const a = f.attack;
        const slot = a.weight === 'special' ? 'special' : a.weight === 'heavy' ? 'heavy' : `light${f.combo + 1}`;
        this.slot = '';
        this.play(slot, false, totalMs(a));
      }
    } else this.play(stride > 0 ? moveSlot(stepX, stepZ, f.yaw) : 'idle', true);
    this.lastAttack = f.attack && isSwinging(f) ? f.attack.id : null;

    this.hilt.computeWorldMatrix(true);
    this.tip.computeWorldMatrix(true);
    this.rootPoint.copyFrom(this.hilt.getAbsolutePosition());
    this.tipPoint.copyFrom(this.tip.getAbsolutePosition());
  }

  /** How this fighter's clips were found, for checking a new model. */
  get slots(): string[] {
    return [...this.groups.keys()];
  }
}
