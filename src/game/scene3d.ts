import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { penModel, type PenLook, type PenModelId } from './pens';
import {
  DESK,
  FALL_DEPTH,
  HALF_SEG,
  MAX_IMPULSE,
  PEN_HALF_HEIGHT,
  PEN_LENGTH,
  pointOnPen,
} from './physics';
import { PLAYER_COLORS } from './players';
import type { Flick, Pen, PlayerId, Vec } from './types';
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
/** At this scale a 15 cm pen is 1.5 units, so a 75 cm school desk stands about 5 units tall. */
const FLOOR_Y = -4.8;
const DESK_THICKNESS = 0.22;
/** How far beyond the desk's far edge the classroom wall stands. */
const WALL_GAP = 4.2;
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

interface PenRig {
  group: THREE.Group;
  materials: THREE.Material[];
  fading: boolean;
}

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

/**
 * three.js view of the classroom desk. Physics is in desk pixels; here
 * 1 unit = UNITS px, the same scale as the Rapier world, with desk y along world z.
 */
export class DeskScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  private cameraBase = new THREE.Vector3();
  private shake = 0;
  private pens: PenRig[] = [];
  private models: [PenModelId, PenModelId] | null = null;
  private glow: THREE.Mesh;
  private aimDashes: THREE.InstancedMesh;
  private aimRing: THREE.Mesh;
  private band: THREE.Mesh;
  private finger: FingerRig;
  private snap: Snap | null = null;
  /** Far-side props for each camera orientation: across the desk's long or short end. */
  private farLandscape = new THREE.Group();
  private farPortrait = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -R);
  private tmp = new THREE.Object3D();

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // The room environment gives plastic and metal something to reflect.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    pmrem.dispose();
    this.scene.background = new THREE.Color('#2f3b2f');
    this.scene.fog = new THREE.Fog('#2f3b2f', 18, 40);

    this.buildClassroom();

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
      new THREE.MeshBasicMaterial({ color: '#f39a3d', transparent: true, opacity: 0.9, depthWrite: false }),
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
  }

  setModels(models: [PenModelId, PenModelId]): void {
    if (this.models && this.models[0] === models[0] && this.models[1] === models[1]) return;
    this.models = models;
    for (const p of this.pens) this.scene.remove(p.group);
    this.pens = models.map((m, i) => {
      const rig = buildPen(penModel(m).look, PLAYER_COLORS[i as PlayerId]);
      this.scene.add(rig.group);
      return rig;
    });
  }

  /** `width` and `height` in CSS pixels. */
  resize(width: number, height: number): void {
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    const cam = this.camera;
    cam.aspect = aspect;
    cam.clearViewOffset();
    // On tall screens view the desk from its short end, so its long side runs down the screen,
    // the way you see a desk when you sit at it.
    const portrait = aspect < 1.15;
    this.farLandscape.visible = !portrait;
    this.farPortrait.visible = portrait;
    // Low enough to feel like sitting at the desk, high enough to judge angles across it.
    const elev = THREE.MathUtils.degToRad(portrait ? 56 : aspect < 1.5 ? 54 : 50);
    const target = new THREE.Vector3(W / 2, 0, D / 2);
    const toward = portrait
      ? new THREE.Vector3(Math.cos(elev), Math.sin(elev), 0)
      : new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
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

  /** The finger snaps forward from its cocked pose and strikes the pen. */
  playFlick(aim: Aim): void {
    const pose = fingerPose(aim);
    const contact = pointOnPen(aim.pen, aim.flick.along);
    const to = new THREE.Vector3(
      contact.x / UNITS - Math.cos(pose.dir) * (R + 0.012),
      R + 0.03,
      contact.y / UNITS - Math.sin(pose.dir) * (R + 0.012),
    );
    this.snap = { start: performance.now(), from: pose.tip, to, dir: pose.dir, curl: pose.curl };
  }

  /** Shakes the view a little for a hit of `strength` 0..1. */
  bump(strength: number): void {
    this.shake = Math.min(0.07, this.shake + strength * 0.05);
  }

  /** `hover` brightens the turn glow when the pointer is over the pen that can be grabbed. */
  render(pens: [Pen, Pen], aim: Aim | null, highlight: PlayerId | null, time: number, hover = false): void {
    pens.forEach((pen, i) => this.placePen(i, pen));

    const lit = highlight !== null ? pens[highlight] : null;
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
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
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
    this.renderer.dispose();
  }

  private buildClassroom(): void {
    const hemi = new THREE.HemisphereLight('#fff4e0', '#4a3a28', 0.55);
    this.scene.add(hemi);
    // Daylight from the classroom windows, off to one side.
    const sun = new THREE.DirectionalLight('#fff1d6', 2.0);
    sun.position.set(W / 2 + 4, 10, D / 2 + 3);
    sun.target.position.set(W / 2, 0, D / 2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = sun.shadow.camera;
    s.left = -7;
    s.right = 7;
    s.top = 7;
    s.bottom = -7;
    s.near = 1;
    s.far = 30;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.01;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight('#dfe8ff', 0.35);
    fill.position.set(W / 2 - 6, 6, D / 2 - 4);
    this.scene.add(fill);

    // Desk top with a worn, scratched, carved-into surface.
    const wood = new THREE.CanvasTexture(wornDeskCanvas());
    wood.colorSpace = THREE.SRGBColorSpace;
    wood.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const top = new THREE.MeshPhysicalMaterial({
      map: wood,
      roughness: 0.62,
      clearcoat: 0.25,
      clearcoatRoughness: 0.55,
    });
    const edge = new THREE.MeshStandardMaterial({ color: '#6b3a17', roughness: 0.7 });
    const desk = new THREE.Mesh(new THREE.BoxGeometry(W, DESK_THICKNESS, D), [edge, edge, top, edge, edge, edge]);
    desk.position.set(W / 2, -DESK_THICKNESS / 2, D / 2);
    desk.receiveShadow = true;
    desk.castShadow = true;
    this.scene.add(desk);

    // Steel frame and legs.
    const steel = new THREE.MeshStandardMaterial({ color: '#3b3f45', metalness: 0.7, roughness: 0.45 });
    const legH = -DESK_THICKNESS - FLOOR_Y;
    for (const [x, z] of [
      [0.35, 0.35],
      [W - 0.35, 0.35],
      [0.35, D - 0.35],
      [W - 0.35, D - 0.35],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, legH, 0.16), steel);
      leg.position.set(x, FLOOR_Y + legH / 2, z);
      leg.castShadow = true;
      this.scene.add(leg);
    }
    const apron = new THREE.Mesh(new THREE.BoxGeometry(W - 0.6, 0.3, D - 0.6), steel);
    apron.position.set(W / 2, -DESK_THICKNESS - 0.15, D / 2);
    this.scene.add(apron);

    // Tiled classroom floor.
    const tiles = new THREE.CanvasTexture(tileCanvas());
    tiles.colorSpace = THREE.SRGBColorSpace;
    tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
    tiles.repeat.set(9, 9);
    tiles.anisotropy = 8;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(72, 72),
      new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.75 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(W / 2, FLOOR_Y, D / 2);
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.buildFarSide(this.farLandscape, false);
    this.buildFarSide(this.farPortrait, true);
    this.scene.add(this.farLandscape, this.farPortrait);
  }

  /** The wall, blackboard and the next bench beyond the desk's far edge. */
  private buildFarSide(group: THREE.Group, portrait: boolean): void {
    const span = 40;
    const wallH = 14;
    const wallTex = new THREE.CanvasTexture(wallCanvas());
    wallTex.colorSpace = THREE.SRGBColorSpace;
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(span, wallH),
      new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }),
    );
    wall.position.set(0, FLOOR_Y + wallH / 2, 0);
    wall.receiveShadow = true;
    group.add(wall);

    // Blackboard with a wooden frame and chalk dust.
    const boardTex = new THREE.CanvasTexture(boardCanvas());
    boardTex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 3),
      new THREE.MeshStandardMaterial({ map: boardTex, roughness: 0.95 }),
    );
    board.position.set(0, 3.2, 0.06);
    group.add(board);
    const frameMat = new THREE.MeshStandardMaterial({ color: '#5a3a1e', roughness: 0.7 });
    for (const [w, h, x, y] of [
      [9.3, 0.16, 0, 4.78],
      [9.3, 0.22, 0, 1.62],
      [0.16, 3.3, -4.6, 3.2],
      [0.16, 3.3, 4.6, 3.2],
    ]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), frameMat);
      bar.position.set(x, y, 0.08);
      group.add(bar);
    }

    // The bench in front: its seat back shows over the far edge of the desk.
    const benchMat = new THREE.MeshStandardMaterial({ color: '#6e3f1c', roughness: 0.6 });
    const benchBack = new THREE.Mesh(new THREE.BoxGeometry(portrait ? D * 0.75 : W * 0.55, 0.85, 0.08), benchMat);
    benchBack.position.set(0, 0.55, WALL_GAP - 1.6);
    benchBack.castShadow = true;
    benchBack.receiveShadow = true;
    group.add(benchBack);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 5.6, 0.1),
        new THREE.MeshStandardMaterial({ color: '#3b3f45', metalness: 0.7, roughness: 0.45 }),
      );
      post.position.set(side * ((portrait ? D * 0.75 : W * 0.55) / 2 - 0.2), FLOOR_Y + 2.8, WALL_GAP - 1.6);
      group.add(post);
    }

    // Wall faces the desk: placed beyond its far edge.
    if (portrait) {
      group.rotation.y = Math.PI / 2;
      group.position.set(-WALL_GAP, 0, D / 2);
    } else {
      group.position.set(W / 2, 0, -WALL_GAP);
    }
  }

  private placePen(i: number, pen: Pen): void {
    const rig = this.pens[i];
    if (!rig) return;
    rig.group.position.set(pen.x / UNITS, pen.h / UNITS, pen.y / UNITS);
    rig.group.quaternion.set(pen.q[0], pen.q[1], pen.q[2], pen.q[3]);
    // Fade out as it drops below the desk, so it never pops out of view.
    const fade = THREE.MathUtils.clamp((PEN_HALF_HEIGHT - pen.h - 40) / (FALL_DEPTH - 40), 0, 1);
    rig.group.visible = fade < 1;
    const fading = fade > 0;
    for (const m of rig.materials) {
      const base = (m.userData.baseOpacity as number | undefined) ?? 1;
      m.opacity = base * (1 - fade);
      if (fading !== rig.fading) {
        m.transparent = fading || base < 1;
        m.needsUpdate = true;
      }
    }
    rig.fading = fading;
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
          const k = easeOutBack(t / SNAP_MS);
          f.group.position.lerpVectors(from, to, k);
          f.knuckle.rotation.z = -curl * (1 - Math.min(1, t / SNAP_MS));
          setOpacity(f.materials, 1);
        } else {
          const r = Math.max(0, t - SNAP_MS - HOLD_MS) / RETREAT_MS;
          f.group.position.set(
            to.x - Math.cos(dir) * r * 0.35,
            to.y + r * 0.25,
            to.z - Math.sin(dir) * r * 0.35,
          );
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

/** Fingertip drawn back from the pen and cocked, further with more power. */
function fingerPose(aim: Aim): { tip: THREE.Vector3; dir: number; curl: number } {
  const contact = pointOnPen(aim.pen, aim.flick.along);
  const dir = Math.atan2(aim.flick.iy, aim.flick.ix);
  const power = Math.min(1, Math.hypot(aim.flick.ix, aim.flick.iy) / MAX_IMPULSE);
  const back = R + 0.08 + power * 0.55;
  return {
    tip: new THREE.Vector3(
      contact.x / UNITS - Math.cos(dir) * back,
      R + 0.05 + power * 0.06,
      contact.y / UNITS - Math.sin(dir) * back,
    ),
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

const easeOutBack = (x: number) => {
  const c1 = 1.4;
  return 1 + (c1 + 1) * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};

/** A finger lying along +x with its tip at the origin, bending at the last knuckle. */
function buildFinger(): FingerRig {
  const skin = new THREE.MeshPhysicalMaterial({
    color: '#d9a07c',
    roughness: 0.55,
    sheen: 0.6,
    sheenColor: new THREE.Color('#ffd7c2'),
    transparent: true,
  });
  const nail = new THREE.MeshPhysicalMaterial({
    color: '#f0cfc4',
    roughness: 0.25,
    clearcoat: 1,
    transparent: true,
  });
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

/**
 * A stick pen lying along local +x (writing tip at +x), centred on its middle,
 * with the cap posted on the back end.
 */
function buildPen(look: PenLook, marker: string): PenRig {
  const group = new THREE.Group();
  const materials: THREE.Material[] = [];
  const keep = <M extends THREE.Material>(m: M, baseOpacity = 1): M => {
    m.userData.baseOpacity = baseOpacity;
    m.opacity = baseOpacity;
    m.transparent = baseOpacity < 1;
    materials.push(m);
    return m;
  };
  const plastic = (color: string, opts: Partial<THREE.MeshPhysicalMaterialParameters> = {}) =>
    keep(
      new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.12, ...opts }),
    );
  const metal = (color: string, roughness = 0.18) =>
    keep(new THREE.MeshStandardMaterial({ color, metalness: 1, roughness, envMapIntensity: 1.6 }));
  const chrome = metal('#d7dbe0', 0.12);

  // A tube along x from x0 to x1, radius r0 at x0 and r1 at x1.
  const tube = (x0: number, x1: number, r0: number, r1: number, m: THREE.Material, segs = 32) => {
    const geo = new THREE.CylinderGeometry(r1, r0, x1 - x0, segs, 1);
    geo.rotateZ(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.x = (x0 + x1) / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  const half = L / 2;
  const r = R * 0.9;
  const capEnd = -half + 0.42;
  const noseStart = half - 0.27;
  const tipStart = half - 0.065;

  // Barrel.
  const segs = look.barrelShape === 'hex' ? 6 : 32;
  const barrelMat = look.metal
    ? metal(look.barrel, 0.2)
    : look.translucent
      ? keep(
          new THREE.MeshPhysicalMaterial({
            color: look.barrel,
            roughness: 0.1,
            transmission: 0.88,
            thickness: 0.05,
            ior: 1.46,
            clearcoat: 1,
          }),
        )
      : plastic(look.barrel);
  const barrel = tube(-half + 0.08, noseStart, r, r, barrelMat, segs);
  if (look.barrelShape === 'hex') {
    (barrel.material as THREE.MeshPhysicalMaterial).flatShading = true;
    barrel.rotation.x = Math.PI / 6;
  }

  // Ink refill, seen through a clear barrel.
  if (look.translucent) {
    tube(-half + 0.1, noseStart + 0.05, 0.017, 0.017, plastic('#f4f6f8', { roughness: 0.4, clearcoat: 0 }), 12);
    tube(-half + 0.1, 0.05, 0.0145, 0.0145, plastic(look.ink, { roughness: 0.5, clearcoat: 0 }), 12);
  }

  // Printed text along one side of the barrel.
  const printMat = keep(
    new THREE.MeshBasicMaterial({ map: printTexture(look.print, look.printColor), transparent: true, depthWrite: false }),
  );
  printMat.userData.baseOpacity = 1;
  printMat.transparent = true;
  const print = tube(-0.12, 0.42, r * 1.012, r * 1.012, printMat, 32);
  print.castShadow = false;

  // Grip, with fine ribs.
  if (look.grip) {
    const gripMat = plastic(look.grip, { roughness: 0.85, clearcoat: 0 });
    tube(noseStart - 0.24, noseStart, r * 1.06, r * 1.06, gripMat);
    for (let x = noseStart - 0.22; x < noseStart - 0.01; x += 0.028) tube(x, x + 0.01, r * 1.1, r * 1.1, gripMat, 24);
  }

  // Nose cone, metal tip and the ball.
  const noseMat = look.metal ? metal(look.nib, 0.25) : plastic(look.nib, look.translucent ? { roughness: 0.2 } : {});
  tube(noseStart, tipStart, r, 0.024, noseMat);
  tube(tipStart, half - 0.008, 0.02, 0.0065, chrome, 20);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0075, 12, 8), metal('#2a2a2a', 0.3));
  ball.position.x = half - 0.006;
  group.add(ball);

  // Cap posted on the back end: shell, domed top, clip with a bead.
  const capMat = look.metal ? metal(look.cap, 0.22) : plastic(look.cap);
  tube(-half + 0.035, capEnd, r * 1.14, r * 1.1, capMat);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 1.14, 24, 12), look.metal ? capMat : plastic(look.plug));
  dome.scale.x = 0.5;
  dome.position.x = -half + 0.035;
  dome.castShadow = true;
  group.add(dome);
  const clipMat = look.metal ? chrome : capMat;
  const clip = new THREE.Mesh(new THREE.BoxGeometry(capEnd + half - 0.12, 0.014, 0.034), clipMat);
  clip.position.set((-half + 0.06 + capEnd - 0.06) / 2, r * 1.14 + 0.014, 0);
  clip.castShadow = true;
  group.add(clip);
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 8), clipMat);
  bead.scale.set(1.4, 0.8, 1);
  bead.position.set(capEnd - 0.06, r * 1.14 + 0.012, 0);
  group.add(bead);
  if (look.metal) {
    for (const x of [capEnd - 0.01, -half + 0.12]) tube(x, x + 0.015, r * 1.16, r * 1.16, chrome);
  }

  // Thin player-colour ring where the cap meets the barrel.
  tube(capEnd, capEnd + 0.022, r * 1.08, r * 1.08, plastic(marker, { clearcoat: 0.3 }));

  return { group, materials, fading: false };
}

/** Seeded random numbers so textures look the same on every load. */
function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/** The school desk top: orange varnished wood worn by years of pupils. */
function wornDeskCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1280;
  const g = c.getContext('2d')!;
  const rand = seeded(7);

  const base = g.createLinearGradient(0, 0, c.width, c.height);
  base.addColorStop(0, '#a85f28');
  base.addColorStop(0.5, '#9e5623');
  base.addColorStop(1, '#934e1e');
  g.fillStyle = base;
  g.fillRect(0, 0, c.width, c.height);

  // Grain along the length of the desk.
  for (let i = 0; i < 260; i++) {
    const y = rand() * c.height;
    const dark = rand() < 0.65;
    g.strokeStyle = dark
      ? `rgba(92, 42, 12, ${0.05 + rand() * 0.12})`
      : `rgba(255, 196, 130, ${0.03 + rand() * 0.07})`;
    g.lineWidth = 0.8 + rand() * 3;
    g.beginPath();
    g.moveTo(-20, y);
    const amp = 2 + rand() * 7;
    const freq = 120 + rand() * 260;
    const phase = rand() * 10;
    for (let x = 0; x <= c.width + 40; x += 24) g.lineTo(x, y + Math.sin(x / freq + phase) * amp);
    g.stroke();
  }

  // Two faint seams between boards.
  g.strokeStyle = 'rgba(60, 26, 8, 0.25)';
  g.lineWidth = 2;
  for (const y of [c.height * 0.34, c.height * 0.68]) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(c.width, y + 3);
    g.stroke();
  }

  // Worn, lighter patches where elbows and books rub.
  for (let i = 0; i < 14; i++) {
    const x = rand() * c.width;
    const y = rand() * c.height;
    const rad = 120 + rand() * 260;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(240, 170, 100, ${0.06 + rand() * 0.06})`);
    grad.addColorStop(1, 'rgba(240, 170, 100, 0)');
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // Scratches: light gouges, each with a darker lip.
  for (let i = 0; i < 230; i++) {
    const x = rand() * c.width;
    const y = rand() * c.height;
    const a = rand() * Math.PI * 2;
    const len = 12 + rand() * (rand() < 0.15 ? 260 : 90);
    const bend = (rand() - 0.5) * 0.4;
    g.lineWidth = 0.6 + rand() * 1.4;
    g.strokeStyle = `rgba(70, 30, 8, ${0.15 + rand() * 0.2})`;
    curve(g, x + 1.2, y + 1.2, a, len, bend);
    g.strokeStyle = `rgba(255, 222, 180, ${0.18 + rand() * 0.35})`;
    curve(g, x, y, a, len, bend);
  }

  // A cup ring and an older half-ring.
  ring(g, c.width * 0.56, c.height * 0.2, 46, 'rgba(70, 30, 8, 0.32)', 5, 0, Math.PI * 2);
  ring(g, c.width * 0.18, c.height * 0.78, 52, 'rgba(70, 30, 8, 0.2)', 4, 0.6, Math.PI * 1.5);

  // Things carved and scribbled into it over the years.
  g.save();
  g.lineCap = 'round';
  carve(g, '#', c.width * 0.27, c.height * 0.13, -0.15, 70);
  carve(g, 'A + K', c.width * 0.8, c.height * 0.48, 1.45, 56);
  carve(g, 'X-B', c.width * 0.12, c.height * 0.5, -1.6, 48);
  carve(g, '2026', c.width * 0.66, c.height * 0.86, 0.05, 44);
  carve(g, 'GOAT', c.width * 0.36, c.height * 0.92, -0.08, 36);
  g.restore();

  // Ink blots and a pencil doodle.
  for (let i = 0; i < 9; i++) {
    const x = rand() * c.width;
    const y = rand() * c.height;
    g.fillStyle = rand() < 0.6 ? 'rgba(25, 30, 70, 0.55)' : 'rgba(20, 15, 10, 0.5)';
    g.beginPath();
    g.ellipse(x, y, 3 + rand() * 8, 2 + rand() * 6, rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(60, 60, 70, 0.35)';
  g.lineWidth = 2;
  star(g, c.width * 0.9, c.height * 0.12, 26);

  // Darker grime towards the edges.
  const vignette = g.createRadialGradient(c.width / 2, c.height / 2, c.height * 0.4, c.width / 2, c.height / 2, c.width * 0.62);
  vignette.addColorStop(0, 'rgba(50, 20, 5, 0)');
  vignette.addColorStop(1, 'rgba(50, 20, 5, 0.32)');
  g.fillStyle = vignette;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function curve(g: CanvasRenderingContext2D, x: number, y: number, a: number, len: number, bend: number): void {
  g.beginPath();
  g.moveTo(x, y);
  const mx = x + Math.cos(a + bend) * len * 0.5;
  const my = y + Math.sin(a + bend) * len * 0.5;
  g.quadraticCurveTo(mx, my, x + Math.cos(a) * len, y + Math.sin(a) * len);
  g.stroke();
}

function ring(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  width: number,
  a0: number,
  a1: number,
): void {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.beginPath();
  g.arc(x, y, r, a0, a1);
  g.stroke();
}

function carve(g: CanvasRenderingContext2D, text: string, x: number, y: number, rot: number, size: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.font = `600 ${size}px "Courier New", monospace`;
  g.textAlign = 'center';
  g.lineWidth = 2.5;
  g.strokeStyle = 'rgba(60, 25, 6, 0.45)';
  g.strokeText(text, 1.5, 1.5);
  g.lineWidth = 1.6;
  g.strokeStyle = 'rgba(255, 215, 165, 0.45)';
  g.strokeText(text, 0, 0);
  g.restore();
}

function star(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  for (let i = 0; i <= 5; i++) {
    const a = -Math.PI / 2 + i * ((Math.PI * 4) / 5);
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.stroke();
}

function tileCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const rand = seeded(3);
  g.fillStyle = '#8f8573';
  g.fillRect(0, 0, 512, 512);
  const n = 4;
  const s = 512 / n;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const shade = 200 + Math.floor(rand() * 18);
      g.fillStyle = `rgb(${shade + 10}, ${shade + 2}, ${shade - 22})`;
      g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
      g.fillStyle = `rgba(120, 100, 70, ${rand() * 0.08})`;
      g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
    }
  }
  return c;
}

function wallCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d')!;
  // Painted dado at the bottom, lighter paint above.
  g.fillStyle = '#56704c';
  g.fillRect(0, 0, 256, 512);
  g.fillStyle = '#3d5236';
  g.fillRect(0, 512 * 0.62, 256, 512 * 0.38);
  g.fillStyle = '#2c3b27';
  g.fillRect(0, 512 * 0.615, 256, 6);
  g.fillStyle = '#4a3420';
  g.fillRect(0, 500, 256, 12);
  return c;
}

function boardCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 340;
  const g = c.getContext('2d')!;
  const rand = seeded(5);
  g.fillStyle = '#26332c';
  g.fillRect(0, 0, c.width, c.height);
  // Half-wiped chalk.
  for (let i = 0; i < 40; i++) {
    const x = rand() * c.width;
    const y = rand() * c.height;
    const rad = 40 + rand() * 120;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(220, 230, 225, ${0.04 + rand() * 0.06})`);
    grad.addColorStop(1, 'rgba(220, 230, 225, 0)');
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.strokeStyle = 'rgba(235, 240, 235, 0.35)';
  g.lineWidth = 3;
  for (let i = 0; i < 5; i++) {
    const y = 60 + i * 50 + rand() * 10;
    g.beginPath();
    g.moveTo(80 + rand() * 60, y);
    for (let x = 140; x < 140 + rand() * 500; x += 18) g.lineTo(x, y + (rand() - 0.5) * 8);
    g.stroke();
  }
  return c;
}

function printTexture(text: string, color: string): THREE.CanvasTexture {
  // Cylinder UVs: u runs around the barrel, v along it.
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 1024;
  const g = c.getContext('2d')!;
  g.translate(32, c.height / 2);
  g.rotate(Math.PI / 2);
  g.fillStyle = color;
  g.font = '600 46px "Arial Narrow", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
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
