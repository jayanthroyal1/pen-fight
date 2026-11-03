import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { buildClassroom, type ChalkScore, type Classroom } from './classroom';
import { Fx } from './fx';
import { buildPen, type PenRig } from './penMesh';
import { DESK, FALL_DEPTH, HALF_SEG, MAX_IMPULSE, PEN_HALF_HEIGHT, PEN_LENGTH, flatRotation, pointOnPen } from './physics';
import { PLAYER_COLORS } from './players';
import { power as powerOf, type EntryStyle, type PowerId } from './powers';
import type { ResolvedQuality } from './quality';
import type { RoomTheme } from './rooms';
import type { Flick, Loadout, Pen, PlayerId, Vec } from './types';
import { UNITS } from './world';

/** The pen being aimed and the flick the current drag would make. */
export interface Aim {
  pen: Pen;
  flick: Flick;
  /** Where the pointer is on the desk (desk px), for the rubber band. */
  pointer?: Vec | null;
  /** The pull is stretched as far as it goes. */
  full?: boolean;
}

const W = DESK.width / UNITS;
const D = DESK.height / UNITS;
const L = PEN_LENGTH / UNITS;
const R = PEN_HALF_HEIGHT / UNITS;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
/** The aim guide: a fixed run of dashes from the grab point. */
const AIM_DASHES = 9;
const AIM_DASH_LENGTH = 0.16;
const AIM_DASH_STEP = 0.26;
const AIM_START = 0.14;
const AIM_COLOR = '#fff4dc';
const AIM_FULL = '#e5312a';
const SNAP_MS = 70;
const HOLD_MS = 60;
const RETREAT_MS = 240;
/** Seconds each pen's entry takes: a plain drop, or a hero's entrance. */
const PLAIN_ENTRY = 0.55;
const HERO_ENTRY = 1.7;

interface FingerRig {
  group: THREE.Group;
  knuckle: THREE.Group;
  materials: THREE.Material[];
}

interface Snap {
  start: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  dir: number;
  curl: number;
}

interface IntroItem {
  player: PlayerId;
  style: EntryStyle | 'drop';
  power: PowerId | null;
  start: number;
  duration: number;
  /** Fired once when the pen arrives (or, for some heroes, as it sets off). */
  shouted: boolean;
  landed: boolean;
}

interface BreakAnim {
  start: number;
  winner: PlayerId;
  winnerPower: PowerId | null;
  from: THREE.Vector3;
  fromQ: THREE.Quaternion;
  victim: PenRig;
  at: THREE.Vector3;
  broken: boolean;
  spins: [THREE.Vector3, THREE.Vector3];
  vels: [THREE.Vector3, THREE.Vector3];
  onDone: () => void;
}

/**
 * three.js view of the classroom desk. Physics is in desk pixels; here
 * 1 unit = UNITS px, the same scale as the Rapier world, with desk y along world z.
 */
export class DeskScene {
  /** Called when a hero shouts: on entry, on a strike, when breaking a pen. */
  onShout: (text: string, color: string, power: PowerId | null) => void = () => {};
  /** Called the moment a pen snaps in two. */
  onBreak: () => void = () => {};

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  private cameraBase = new THREE.Vector3();
  private shake = 0;
  private classroom: Classroom;
  private fx = new Fx();
  private pens: PenRig[] = [];
  /** A soft shadow on the desk under each pen, darker the closer the pen is. */
  private contacts: THREE.Mesh[] = [];
  /** High quality: render through a composer that adds ambient occlusion. */
  private composer: EffectComposer | null = null;
  private gtao: GTAOPass | null = null;
  private pixelRatio = 1;
  /** Smoothed frame time (ms), to step quality down if the device struggles. */
  private frameMs = 16;
  private slowFrames = 0;
  private loadouts: [Loadout, Loadout] | null = null;
  private glow: THREE.Mesh;
  private aimDashes: THREE.InstancedMesh;
  private aimRing: THREE.Mesh;
  private band: THREE.Mesh;
  private finger: FingerRig;
  private snap: Snap | null = null;
  private intro: { start: number; items: IntroItem[] } | null = null;
  private breaking: BreakAnim | null = null;
  private raycaster = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -R);
  private tmp = new THREE.Object3D();
  private lastTime = performance.now();

  /** `viewer` is the player sitting at the near end; the camera turns round for player 2 online. */
  constructor(
    private canvas: HTMLCanvasElement,
    theme: RoomTheme,
    private viewer: PlayerId = 0,
    quality: ResolvedQuality = 'high',
  ) {
    const high = quality === 'high';
    // With a composer, multisampling happens in its render target instead.
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !high, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, high ? 2 : 1.25);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // The room environment gives plastic and metal something to reflect.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    pmrem.dispose();
    this.scene.background = new THREE.Color(theme.dado);
    this.scene.fog = new THREE.Fog(theme.dado, 18, 40);

    this.classroom = buildClassroom(this.scene, theme, this.renderer.capabilities.getMaxAnisotropy());
    this.scene.add(this.fx.group);

    this.glow = new THREE.Mesh(
      new THREE.PlaneGeometry(L * 1.3, 0.42),
      new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, depthWrite: false }),
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.scene.add(this.glow);

    const dashGeo = new THREE.PlaneGeometry(AIM_DASH_LENGTH, 0.04);
    dashGeo.rotateX(-Math.PI / 2);
    this.aimDashes = new THREE.InstancedMesh(
      dashGeo,
      new THREE.MeshBasicMaterial({ color: AIM_COLOR, transparent: true, opacity: 0.95, depthWrite: false }),
      AIM_DASHES,
    );
    this.aimDashes.count = 0;
    this.aimDashes.frustumCulled = false;
    this.scene.add(this.aimDashes);

    const ringGeo = new THREE.RingGeometry(0.05, 0.068, 24);
    ringGeo.rotateX(-Math.PI / 2);
    this.aimRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: AIM_COLOR, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.aimRing.visible = false;
    this.scene.add(this.aimRing);

    // Rubber band from the grab point back to the pointer.
    const bandGeo = new THREE.PlaneGeometry(1, 0.022);
    bandGeo.rotateX(-Math.PI / 2);
    bandGeo.translate(0.5, 0, 0);
    this.band = new THREE.Mesh(
      bandGeo,
      new THREE.MeshBasicMaterial({ color: '#fff6e0', transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.band.visible = false;
    this.scene.add(this.band);

    this.finger = buildFinger();
    this.finger.group.visible = false;
    this.scene.add(this.finger.group);

    if (high) {
      // Multisampled HDR target, then ambient occlusion: soft darkening where pens meet the desk
      // and in the creases between parts, which is most of what makes small objects look real.
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.gtao = new GTAOPass(this.scene, this.camera, 1, 1);
      this.gtao.blendIntensity = 0.9;
      this.gtao.updateGtaoMaterial({ radius: 0.28, distanceExponent: 1.4, thickness: 1, scale: 1.1, samples: 12 });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.composer.addPass(this.gtao);
      this.composer.addPass(new OutputPass());
      // See-through overlays (light beams, glows, the aim line, contact shadows) aren't
      // solid, so hide them while occlusion is worked out or they darken the desk.
      const gtao = this.gtao;
      const renderAo = gtao.render.bind(gtao);
      gtao.render = (...args: Parameters<GTAOPass['render']>) => {
        const overlays = this.overlays();
        const shown = overlays.map((o) => o.visible);
        overlays.forEach((o) => (o.visible = false));
        renderAo(...args);
        overlays.forEach((o, i) => (o.visible = shown[i]));
      };
    }
  }

  setLoadouts(loadouts: [Loadout, Loadout]): void {
    const same =
      this.loadouts &&
      this.loadouts.every((l, i) => l.model === loadouts[i].model && l.power === loadouts[i].power);
    if (same) return;
    this.loadouts = loadouts;
    for (const p of this.pens) this.scene.remove(p.group);
    for (const c of this.contacts) this.scene.remove(c);
    this.pens = loadouts.map((l, i) => {
      const rig = buildPen(l.model, l.power, { marker: PLAYER_COLORS[i as PlayerId] });
      this.scene.add(rig.group);
      return rig;
    });
    this.contacts = this.pens.map(() => {
      const geo = new THREE.PlaneGeometry(L * 1.08, 0.2);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({ map: contactTexture(), transparent: true, depthWrite: false, color: '#000000' }),
      );
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      return mesh;
    });
  }

  setScore(score: ChalkScore): void {
    this.classroom.setScore(score);
  }

  /** `width` and `height` in CSS pixels. */
  resize(width: number, height: number): void {
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.composer?.setPixelRatio(this.pixelRatio);
    this.composer?.setSize(width, height);
    const aspect = width / height;
    const cam = this.camera;
    cam.aspect = aspect;
    cam.clearViewOffset();
    // On tall screens view the desk from its short end, so its long side runs down the screen,
    // the way you see a desk when you sit at it.
    const portrait = aspect < 1.15;
    const flipped = this.viewer === 1;
    this.classroom.orient(portrait, flipped);
    // Low enough to feel like sitting at the desk, high enough to judge angles across it.
    const elev = THREE.MathUtils.degToRad(portrait ? 56 : aspect < 1.5 ? 54 : 50);
    const target = new THREE.Vector3(W / 2, 0, D / 2);
    const side = flipped ? -1 : 1;
    const toward = portrait
      ? new THREE.Vector3(side * Math.cos(elev), Math.sin(elev), 0)
      : new THREE.Vector3(0, Math.sin(elev), side * Math.cos(elev));
    const corners = [
      [0, 0],
      [W, 0],
      [0, D],
      [W, D],
    ].map(([x, z]) => new THREE.Vector3(x, 0.02, z));
    const place = (dist: number) => {
      cam.position.copy(target).addScaledVector(toward, dist);
      cam.lookAt(target);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
    };
    const fits = () =>
      corners.every((c) => {
        const v = c.clone().project(cam);
        return Math.abs(v.x) <= 0.97 && Math.abs(v.y) <= 0.94;
      });
    // Closest camera distance at which the whole desk top still shows.
    let lo = 1;
    let hi = 60;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      place(mid);
      if (fits()) hi = mid;
      else lo = mid;
    }
    place(hi);
    // Slide the view so the near edge sits at the bottom and the classroom fills the top.
    const nearY = Math.min(...corners.map((c) => c.clone().project(cam).y));
    const shiftPx = ((nearY + 0.97) / 2) * height;
    if (shiftPx > 1) cam.setViewOffset(width, height, 0, -shiftPx, width, height);
    this.cameraBase.copy(cam.position);
  }

  /** Desk position (pixels) under a pointer, at pen height. */
  pick(clientX: number, clientY: number): Vec | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.camera.position.copy(this.cameraBase);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.aimPlane, hit)) return null;
    return { x: hit.x * UNITS, y: hit.z * UNITS };
  }

  /**
   * How far (CSS px) a pointer is from the pen as drawn on screen, and the
   * grab point along the pen nearest to it.
   */
  screenHit(pen: Pen, clientX: number, clientY: number): { dist: number; along: number } {
    const rect = this.canvas.getBoundingClientRect();
    const toScreen = (along: number) => {
      const p = pointOnPen(pen, along);
      const v = new THREE.Vector3(p.x / UNITS, pen.h / UNITS, p.y / UNITS).project(this.camera);
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    };
    const a = toScreen(-HALF_SEG);
    const b = toScreen(HALF_SEG);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const t = THREE.MathUtils.clamp(((clientX - a.x) * abx + (clientY - a.y) * aby) / (abx * abx + aby * aby || 1), 0, 1);
    return {
      dist: Math.hypot(clientX - (a.x + abx * t), clientY - (a.y + aby * t)),
      along: (t * 2 - 1) * HALF_SEG,
    };
  }

  /** Something is animating that play should wait for: an entry or a pen being broken. */
  busy(): boolean {
    return this.intro !== null || this.breaking !== null;
  }

  /**
   * Both pens arrive on the desk: a quick drop, or the hero's own entrance.
   * Player 1 first. Returns how long it takes, in seconds.
   */
  playIntro(loadouts: [Loadout, Loadout]): number {
    let t = 0.2;
    const items: IntroItem[] = loadouts.map((l, i) => {
      const style = l.power ? powerOf(l.power).entry : 'drop';
      const duration = l.power ? HERO_ENTRY : PLAIN_ENTRY;
      const item: IntroItem = { player: i as PlayerId, style, power: l.power, start: t, duration, shouted: false, landed: false };
      t += duration + (l.power ? 0.35 : 0.1);
      return item;
    });
    this.intro = { start: performance.now() / 1000, items };
    return t;
  }

  /** The finger snaps forward and strikes the pen; a hero's flick leaves its mark too. */
  playFlick(aim: Aim, power: PowerId | null = null): void {
    const pose = fingerPose(aim);
    const contact = pointOnPen(aim.pen, aim.flick.along);
    const to = new THREE.Vector3(
      contact.x / UNITS - Math.cos(pose.dir) * (R + 0.012),
      R + 0.03,
      contact.y / UNITS - Math.sin(pose.dir) * (R + 0.012),
    );
    this.snap = { start: performance.now(), from: pose.tip, to, dir: pose.dir, curl: pose.curl };
    if (!power) return;
    const p = powerOf(power);
    const rig = this.pens[aim.pen.id];
    const at = new THREE.Vector3(contact.x / UNITS, 0.01, contact.y / UNITS);
    this.fx.ring(at, p.color, 0.7, 0.45);
    const follow = () => (rig ? rig.group.position.clone() : null);
    switch (power) {
      case 'webflick':
        this.fx.line(() => [to.clone().setY(0.6), rig.group.position.clone()], '#ffffff', 0.35);
        this.fx.trail(follow, p.accent, 1.2);
        break;
      case 'chakra':
        this.fx.whirl(() => rig.group.position.clone(), p.color, 0.9);
        break;
      case 'amazon':
        this.fx.lasso(at, p.color, 0.6);
        this.fx.trail(follow, p.color, 1.2);
        break;
      case 'giant':
        this.fx.crack(at, '#1f3a10', 1.5);
        this.fx.trail(follow, p.color, 1.2);
        break;
      default:
        this.fx.trail(follow, p.color, 1.4);
    }
  }

  /** Two pens hit: a hero shooter's strike gets sparks, a ring and a shout. */
  strike(between: [Pen, Pen], power: PowerId | null, strength: number): void {
    this.bump(strength * (power ? 1.6 : 1));
    if (!power || strength < 0.15) return;
    const p = powerOf(power);
    const at = new THREE.Vector3(
      (between[0].x + between[1].x) / 2 / UNITS,
      R,
      (between[0].y + between[1].y) / 2 / UNITS,
    );
    this.fx.burst(at, p.color, 30 + Math.round(strength * 40), 2 + strength * 2);
    this.fx.ring(at, p.accent, 0.9 + strength, 0.5);
    this.onShout(p.shout, p.color, p.id);
  }

  /**
   * The winner's pen breaks the loser's in half: it rises, hangs, then slams
   * down with its hero's power. `onDone` runs when the pieces have gone.
   */
  playBreak(winner: Pen, loser: Pen, onDone: () => void): void {
    const wRig = this.pens[winner.id];
    const victim = buildPen(loser.model, loser.power, { split: true, marker: PLAYER_COLORS[loser.id] });
    const at = new THREE.Vector3(W / 2, R, D / 2);
    victim.group.position.copy(at);
    victim.group.quaternion.fromArray(flatRotation(this.viewer === 0 ? Math.PI / 2 : -Math.PI / 2));
    this.scene.add(victim.group);
    if (this.pens[loser.id]) this.pens[loser.id].group.visible = false;
    this.breaking = {
      start: performance.now() / 1000,
      winner: winner.id,
      winnerPower: winner.power,
      from: wRig.group.position.clone(),
      fromQ: wRig.group.quaternion.clone(),
      victim,
      at,
      broken: false,
      spins: [new THREE.Vector3(), new THREE.Vector3()],
      vels: [new THREE.Vector3(), new THREE.Vector3()],
      onDone,
    };
  }

  /** Shakes the view a little for a hit of `strength` 0..1. */
  bump(strength: number): void {
    this.shake = Math.min(0.09, this.shake + strength * 0.05);
  }

  /** `hover` brightens the turn glow when the pointer is over the pen that can be grabbed. */
  render(pens: [Pen, Pen], aim: Aim | null, highlight: PlayerId | null, time: number, hover = false): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    pens.forEach((pen, i) => this.placePen(i, pen));
    if (this.intro) this.animateIntro(pens);
    if (this.breaking) this.animateBreak(dt);
    this.fx.update(dt);

    const lit = highlight !== null && !this.busy() ? pens[highlight] : null;
    this.glow.visible = !!lit && !lit.out;
    if (lit) {
      this.glow.position.set(lit.x / UNITS, 0.003, lit.y / UNITS);
      this.glow.rotation.z = -lit.angle;
      const mat = this.glow.material as THREE.MeshBasicMaterial;
      mat.color.set(PLAYER_COLORS[lit.id]);
      // Held or hovered: a steady, brighter glow; otherwise a gentle pulse.
      mat.opacity = aim ? 0.75 : hover ? 0.6 : 0.3 + 0.14 * Math.sin(time * 4);
      this.glow.scale.setScalar(aim || hover ? 1.12 : 1);
    }

    this.placeAim(aim);
    this.placeFinger(aim);

    if (this.shake > 0.0005) {
      this.camera.position.set(
        this.cameraBase.x + (Math.random() - 0.5) * this.shake,
        this.cameraBase.y + (Math.random() - 0.5) * this.shake,
        this.cameraBase.z + (Math.random() - 0.5) * this.shake,
      );
      this.shake *= 0.82;
    } else {
      this.camera.position.copy(this.cameraBase);
    }
    this.placeContacts();
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
    this.adapt(dt);
  }

  /** Everything drawn see-through on top of the scene. */
  private overlays(): THREE.Object3D[] {
    return [this.fx.group, this.glow, this.aimDashes, this.aimRing, this.band, ...this.contacts];
  }

  /** Keeps each pen's contact shadow under it, fading as the pen lifts or falls. */
  private placeContacts(): void {
    const fwd = new THREE.Vector3();
    this.pens.forEach((rig, i) => {
      const c = this.contacts[i];
      if (!c) return;
      const p = rig.group.position;
      fwd.set(1, 0, 0).applyQuaternion(rig.group.quaternion);
      c.position.set(p.x, 0.002, p.z);
      c.rotation.y = -Math.atan2(fwd.z, fwd.x);
      const lift = Math.max(0, p.y - R);
      const mat = c.material as THREE.MeshBasicMaterial;
      mat.opacity = rig.group.visible && p.y > -0.05 ? 0.55 * Math.max(0, 1 - lift * 1.6) : 0;
      c.scale.setScalar(1 + lift * 0.8);
    });
  }

  /**
   * If frames run slow for a few seconds, render at a lower resolution, and as a
   * last step drop ambient occlusion, so play stays smooth.
   */
  private adapt(dt: number): void {
    if (dt <= 0 || dt > 0.25) return;
    this.frameMs += (dt * 1000 - this.frameMs) * 0.05;
    this.slowFrames = this.frameMs > 24 ? this.slowFrames + 1 : 0;
    if (this.slowFrames < 120) return;
    this.slowFrames = 0;
    if (this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      const canvas = this.renderer.domElement;
      this.resize(canvas.clientWidth, canvas.clientHeight);
    } else if (this.gtao?.enabled) {
      this.gtao.enabled = false;
    }
  }

  dispose(): void {
    this.fx.clear();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          (m as THREE.MeshStandardMaterial).map?.dispose();
          m.dispose();
        }
      }
    });
    this.scene.environment?.dispose();
    this.composer?.dispose();
    this.gtao?.dispose();
    this.renderer.dispose();
  }

  private placePen(i: number, pen: Pen): void {
    const rig = this.pens[i];
    if (!rig) return;
    rig.group.position.set(pen.x / UNITS, pen.h / UNITS, pen.y / UNITS);
    rig.group.quaternion.set(pen.q[0], pen.q[1], pen.q[2], pen.q[3]);
    rig.group.scale.setScalar(1);
    // Fade out as it drops below the desk, so it never pops out of view.
    const fade = THREE.MathUtils.clamp((PEN_HALF_HEIGHT - pen.h - 40) / (FALL_DEPTH - 40), 0, 1);
    rig.group.visible = fade < 1 && !(this.breaking && pen.id !== this.breaking.winner);
    setFade(rig, fade);
  }

  /** Overrides where the pens are drawn while they make their entrances. */
  private animateIntro(pens: [Pen, Pen]): void {
    const intro = this.intro!;
    const t = performance.now() / 1000 - intro.start;
    let running = false;
    for (const item of intro.items) {
      const rig = this.pens[item.player];
      if (!rig) continue;
      const pen = pens[item.player];
      const end = new THREE.Vector3(pen.x / UNITS, pen.h / UNITS, pen.y / UNITS);
      const k = (t - item.start) / item.duration;
      if (k < 1) running = true;
      if (k < 0) {
        rig.group.visible = false;
        continue;
      }
      const p = item.power ? powerOf(item.power) : null;
      const color = p?.color ?? '#ffffff';
      if (!item.shouted && p && (k >= 0 && ['swing', 'flyin', 'lasso', 'descend'].includes(item.style))) {
        item.shouted = true;
        this.onShout(p.shout, p.color, p.id);
        if (item.style === 'lasso') this.fx.lasso(end, p.color, item.duration * 0.8);
        if (item.style === 'descend') this.fx.beam(end, p.color, item.duration + 0.4);
        if (item.style === 'flyin') this.fx.trail(() => rig.group.position.clone(), p.color, item.duration);
        if (item.style === 'swing') {
          const pivot = end.clone().add(new THREE.Vector3(0, 4.5, 0));
          this.fx.line(() => [pivot, rig.group.position.clone()], '#ffffff', item.duration * 0.85);
        }
      }
      if (!item.shouted && p && k >= 0 && item.style === 'swoop') {
        item.shouted = true;
        this.fx.wings(end, item.duration * 0.7);
      }
      if (!item.shouted && p && k >= 0 && item.style === 'spin') {
        item.shouted = true;
        this.fx.whirl(() => rig.group.position.clone(), p.color, item.duration);
      }
      const { pos, yaw, scale, landAt } = entryPose(item.style, Math.min(1, k), end);
      if (!item.landed && k >= landAt) {
        item.landed = true;
        this.bump(item.style === 'slam' ? 1.5 : item.power ? 0.5 : 0.15);
        this.fx.ring(end.clone().setY(0.01), color, item.power ? 1.6 : 0.5, item.power ? 0.7 : 0.35);
        if (p) {
          this.fx.burst(end, p.color, 50, 2.6);
          if (item.style === 'slam') this.fx.crack(end);
          if (['slam', 'swoop', 'spin'].includes(item.style)) this.onShout(p.shout, p.color, p.id);
        }
      }
      rig.group.visible = true;
      rig.group.position.copy(pos);
      if (yaw) rig.group.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(Y_AXIS, yaw));
      rig.group.scale.setScalar(scale);
    }
    if (!running) this.intro = null;
  }

  private animateBreak(dt: number): void {
    const b = this.breaking!;
    const t = performance.now() / 1000 - b.start;
    const wRig = this.pens[b.winner];
    const above = b.at.clone().setY(1.9);
    const RISE = 0.7;
    const HANG = 0.45;
    const SLAM = 0.14;
    const p = b.winnerPower ? powerOf(b.winnerPower) : null;
    if (t < RISE) {
      const k = easeInOut(t / RISE);
      wRig.group.position.lerpVectors(b.from, above, k);
    } else if (t < RISE + HANG) {
      wRig.group.position.copy(above).setY(above.y + Math.sin((t - RISE) * 12) * 0.03);
      if (p?.id === 'hanuman') wRig.group.rotateOnWorldAxis(Y_AXIS, dt * 6);
    } else if (t < RISE + HANG + SLAM) {
      const k = (t - RISE - HANG) / SLAM;
      wRig.group.position.lerpVectors(above, b.at.clone().setY(R * 2.4), k * k);
    } else {
      wRig.group.position.copy(b.at).setY(R * 2.4);
      if (!b.broken) {
        b.broken = true;
        const color = p?.color ?? '#ffffff';
        this.bump(2);
        this.fx.burst(b.at, color, 90, 3.2, 0.9);
        this.fx.burst(b.at, '#d9d4c8', 40, 2, 0.8);
        this.fx.ring(b.at, color, 2.2, 0.8, 0.1);
        this.fx.crack(b.at);
        if (p?.id === 'hanuman') this.fx.beam(b.at, p.color, 1.2);
        this.onShout(p?.shout ?? 'CRACK!', color, p?.id ?? null);
        this.onBreak();
        // The halves fly apart along the pen's length (the broken pen's own x axis).
        b.vels = [new THREE.Vector3(-2.4, 2.6, 0.5), new THREE.Vector3(2.4, 2.2, -0.5)];
        b.spins = [new THREE.Vector3(3, 1, 6), new THREE.Vector3(-4, -2, -5)];
      }
      b.victim.halves?.forEach((half, i) => {
        const v = b.vels[i];
        v.y -= 7 * dt;
        half.position.addScaledVector(v, dt);
        if (b.victim.group.position.y + half.position.y < R) {
          half.position.y = R - b.victim.group.position.y;
          v.multiplyScalar(0.5);
          v.y = Math.abs(v.y) * 0.3;
        }
        half.rotation.x += b.spins[i].x * dt;
        half.rotation.y += b.spins[i].y * dt;
        half.rotation.z += b.spins[i].z * dt;
      });
      const end = RISE + HANG + SLAM + 1.8;
      const fade = Math.max(0, Math.min(1, (t - (end - 0.6)) / 0.6));
      setFade(b.victim, fade);
      if (t >= end) {
        this.scene.remove(b.victim.group);
        this.breaking = null;
        b.onDone();
      }
    }
  }

  private placeAim(aim: Aim | null): void {
    const power = aim ? Math.min(1, Math.hypot(aim.flick.ix, aim.flick.iy) / MAX_IMPULSE) : 0;
    this.band.visible = false;
    if (!aim) {
      this.aimDashes.count = 0;
      this.aimRing.visible = false;
      return;
    }
    const from = pointOnPen(aim.pen, aim.flick.along);
    const fx = from.x / UNITS;
    const fz = from.y / UNITS;
    this.aimRing.visible = true;
    this.aimRing.position.set(fx, 0.004, fz);

    if (aim.pointer) {
      const dx = aim.pointer.x / UNITS - fx;
      const dz = aim.pointer.y / UNITS - fz;
      const len = Math.hypot(dx, dz);
      if (len > 0.02) {
        this.band.visible = true;
        this.band.position.set(fx, 0.006, fz);
        this.band.rotation.y = -Math.atan2(dz, dx);
        this.band.scale.x = len;
      }
    }

    // A dashed line that shows only the direction: always the same length, so it
    // gives nothing away about power; red once the pull is stretched all the way.
    if (power < 0.01) {
      this.aimDashes.count = 0;
      return;
    }
    const dir = Math.atan2(aim.flick.iy, aim.flick.ix);
    const cos = Math.cos(dir);
    const sin = Math.sin(dir);
    this.tmp.rotation.set(0, -dir, 0);
    this.tmp.scale.setScalar(1);
    for (let i = 0; i < AIM_DASHES; i++) {
      const d = AIM_START + i * AIM_DASH_STEP + AIM_DASH_LENGTH / 2;
      this.tmp.position.set(fx + cos * d, 0.005, fz + sin * d);
      this.tmp.updateMatrix();
      this.aimDashes.setMatrixAt(i, this.tmp.matrix);
    }
    this.aimDashes.count = AIM_DASHES;
    this.aimDashes.instanceMatrix.needsUpdate = true;
    (this.aimDashes.material as THREE.MeshBasicMaterial).color.set(aim.full ? AIM_FULL : AIM_COLOR);
  }

  private placeFinger(aim: Aim | null): void {
    const f = this.finger;
    if (this.snap) {
      const t = performance.now() - this.snap.start;
      if (t > SNAP_MS + HOLD_MS + RETREAT_MS) {
        this.snap = null;
      } else {
        f.group.visible = true;
        const { from, to, dir, curl } = this.snap;
        if (t < SNAP_MS) {
          f.group.position.lerpVectors(from, to, easeOutBack(t / SNAP_MS));
          f.knuckle.rotation.z = -curl * (1 - Math.min(1, t / SNAP_MS));
          setOpacity(f.materials, 1);
        } else {
          const r = Math.max(0, t - SNAP_MS - HOLD_MS) / RETREAT_MS;
          f.group.position.set(to.x - Math.cos(dir) * r * 0.35, to.y + r * 0.25, to.z - Math.sin(dir) * r * 0.35);
          f.knuckle.rotation.z = 0;
          setOpacity(f.materials, 1 - r);
        }
        orientFinger(f.group, dir);
        return;
      }
    }
    if (!aim || Math.hypot(aim.flick.ix, aim.flick.iy) < 1) {
      f.group.visible = false;
      return;
    }
    const pose = fingerPose(aim);
    f.group.visible = true;
    f.group.position.copy(pose.tip);
    f.knuckle.rotation.z = -pose.curl;
    orientFinger(f.group, pose.dir);
    setOpacity(f.materials, 1);
  }
}

/**
 * Where a pen is during its entrance, `k` from 0 to 1, ending at `end`.
 * `landAt` is the moment it touches the desk.
 */
function entryPose(style: EntryStyle | 'drop', k: number, end: THREE.Vector3): { pos: THREE.Vector3; yaw: number; scale: number; landAt: number } {
  const pos = end.clone();
  switch (style) {
    case 'slam': {
      // Plummets from far above and hits hard.
      const f = Math.min(1, k / 0.6);
      pos.y += 9 * (1 - f * f);
      return { pos, yaw: 0, scale: 1, landAt: 0.6 };
    }
    case 'swing': {
      // Swings down on a web line from a point above, settling as it lands.
      const len = 4.5;
      const theta = -1.3 * (1 - k) * Math.cos(k * Math.PI * 1.5);
      pos.x += Math.sin(theta) * len;
      pos.y += len - Math.cos(theta) * len + (1 - k) * 0.6;
      return { pos, yaw: 0, scale: 1, landAt: 0.97 };
    }
    case 'flyin': {
      // Streaks in low and fast from the side, braking at the last moment.
      const e = 1 - (1 - k) ** 3;
      pos.z -= (1 - e) * 9;
      pos.y += (1 - e) * 1.2;
      return { pos, yaw: (1 - e) * 0.6, scale: 1, landAt: 0.95 };
    }
    case 'swoop': {
      // Dives out of the dark along a curve.
      const e = easeInOut(k);
      pos.x -= (1 - e) * 4;
      pos.y += Math.sin((1 - e) * Math.PI * 0.5) * 3.5;
      return { pos, yaw: (1 - e) * 1.2, scale: 1, landAt: 0.97 };
    }
    case 'lasso':
      // Appears inside the tightening rope, spinning down.
      pos.y += (1 - k) * 0.8;
      return { pos, yaw: (1 - k) * 10, scale: Math.min(1, k * 1.5), landAt: 0.9 };
    case 'spin': {
      // Spins like a top all the way down.
      const e = easeInOut(k);
      pos.y += (1 - e) * 3.2;
      return { pos, yaw: (1 - k) * 34, scale: 1, landAt: 0.97 };
    }
    case 'descend': {
      // Comes down slowly in a beam of light.
      pos.y += (1 - easeInOut(k)) * 5.5;
      return { pos, yaw: (1 - k) * 3, scale: 1, landAt: 0.97 };
    }
    default: {
      const f = Math.min(1, k / 0.8);
      pos.y += 1.4 * (1 - f * f);
      return { pos, yaw: 0, scale: 1, landAt: 0.8 };
    }
  }
}

const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
const easeOutBack = (x: number) => {
  const c1 = 1.4;
  return 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};

function setFade(rig: PenRig, fade: number): void {
  for (const m of rig.materials) {
    const base = (m.userData.baseOpacity as number | undefined) ?? 1;
    const fading = fade > 0;
    if (m.userData.fading !== fading) {
      m.transparent = fading || base < 1 || m.transparent;
      m.userData.fading = fading;
      m.needsUpdate = true;
    }
    m.opacity = base * (1 - fade);
  }
}

/** Fingertip drawn back from the pen and cocked, further with more power. */
function fingerPose(aim: Aim): { tip: THREE.Vector3; dir: number; curl: number } {
  const contact = pointOnPen(aim.pen, aim.flick.along);
  const dir = Math.atan2(aim.flick.iy, aim.flick.ix);
  const power = Math.min(1, Math.hypot(aim.flick.ix, aim.flick.iy) / MAX_IMPULSE);
  const back = R + 0.08 + power * 0.55;
  return {
    tip: new THREE.Vector3(contact.x / UNITS - Math.cos(dir) * back, R + 0.05 + power * 0.06, contact.y / UNITS - Math.sin(dir) * back),
    dir,
    curl: 0.2 + power * 1.0,
  };
}

function orientFinger(group: THREE.Group, dir: number): void {
  group.rotation.set(0, -dir, -0.14);
}

function setOpacity(materials: THREE.Material[], opacity: number): void {
  for (const m of materials) m.opacity = opacity;
}

/** A finger lying along +x with its tip at the origin, bending at the last knuckle. */
function buildFinger(): FingerRig {
  const skin = new THREE.MeshPhysicalMaterial({
    color: '#d9a07c',
    roughness: 0.55,
    sheen: 0.6,
    sheenColor: new THREE.Color('#ffd7c2'),
    transparent: true,
  });
  const nail = new THREE.MeshPhysicalMaterial({ color: '#f0cfc4', roughness: 0.25, clearcoat: 1, transparent: true });
  const group = new THREE.Group();
  const capsule = (r: number, len: number) => {
    const g = new THREE.CapsuleGeometry(r, len, 8, 16);
    g.rotateZ(-Math.PI / 2);
    const m = new THREE.Mesh(g, skin);
    m.castShadow = true;
    return m;
  };
  const joint = -0.25;
  const proximal = capsule(0.088, 0.42);
  proximal.position.x = joint - 0.25;
  group.add(proximal);
  const middle = capsule(0.082, 0.05);
  middle.position.x = joint;
  group.add(middle);
  const knuckle = new THREE.Group();
  knuckle.position.x = joint;
  const distal = capsule(0.076, 0.14);
  distal.position.x = 0.15;
  knuckle.add(distal);
  const nailMesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 10), nail);
  nailMesh.scale.set(1.15, 0.28, 0.85);
  nailMesh.position.set(0.19, 0.062, 0);
  knuckle.add(nailMesh);
  group.add(knuckle);
  return { group, knuckle, materials: [skin, nail] };
}

/** A long soft shadow: dark along the middle, fading to nothing at the edges and ends. */
function contactTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  const across = g.createLinearGradient(0, 0, 0, 64);
  across.addColorStop(0, 'rgba(255,255,255,0)');
  across.addColorStop(0.5, 'rgba(255,255,255,1)');
  across.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = across;
  g.fillRect(0, 0, 256, 64);
  // Fade the ends.
  g.globalCompositeOperation = 'destination-in';
  const along = g.createLinearGradient(0, 0, 256, 0);
  along.addColorStop(0, 'rgba(0,0,0,0)');
  along.addColorStop(0.12, 'rgba(0,0,0,1)');
  along.addColorStop(0.88, 'rgba(0,0,0,1)');
  along.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = along;
  g.fillRect(0, 0, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  // The shape is used as transparency for a black shadow.
  return tex;
}

function radialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
