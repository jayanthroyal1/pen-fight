import * as THREE from 'three';
import { boost as boostOf, type BoostId } from './boosts';
import { DESK, PEN_HALF_HEIGHT, PEN_LENGTH } from './physics';
import { endOf } from './rules';
import type { PlayerId } from './types';
import { UNITS } from './world';

const W = DESK.width / UNITS;
const D = DESK.height / UNITS;
const L = PEN_LENGTH / UNITS;
const R = PEN_HALF_HEIGHT / UNITS;
/** Force Wall as drawn: a little taller than its collider, so it reads from far away. */
const WALL_H = 0.5;
/** Effects are drawn brighter than white, so the bloom pass makes them glow. */
const HDR = 3.2;

const hdr = (color: string, k = HDR) => new THREE.Color(color).multiplyScalar(k);

/** What the super powers in play look like right now. */
export interface BoostView {
  /** Force Wall round `by`'s half; `active` while it's the shot it guards. */
  wall: { by: PlayerId; active: boolean } | null;
  /** Ice on the desk: 0 none, a faint sheen while waiting, 1 for the iced shot. */
  ice: number;
  /** Uneven Desk waiting for this player's shot. */
  tilt: PlayerId | null;
  grip: [boolean, boolean];
  lives: [number, number];
  /** A super power on each player's own coming shot: Lightning, Power Strike or Double Turn. */
  charged: [BoostId | null, BoostId | null];
}

export const NO_BOOSTS: BoostView = { wall: null, ice: 0, tilt: null, grip: [false, false], lives: [0, 0], charged: [null, null] };

interface Bolt {
  meshes: THREE.Mesh[];
  life: number;
  age: number;
  from: THREE.Vector3;
  to: THREE.Vector3;
  color: string;
  rebuild: number;
  width: number;
}

/** Flame or spark particles rising round a charged pen. */
interface Aura {
  points: THREE.Points;
  pos: Float32Array;
  vel: Float32Array;
  age: Float32Array;
  life: Float32Array;
  next: number;
  emit: number;
}

const AURA_SIZE = 70;

/**
 * The look of the super powers: glowing walls round half the desk, a sheet
 * of ice, a grip ring under a pen, hearts for spare lives, fire, lightning or
 * orbiting sparks round a charged pen, and lightning bolts from the sky.
 * Everything lives in desk space, so it tilts with the desk.
 */
export class BoostFx {
  readonly group = new THREE.Group();
  /** Lights the desk for a moment when lightning strikes. */
  readonly flash = new THREE.PointLight('#bfe6ff', 0, 9, 1.6);
  private walls: THREE.Mesh[] = [];
  private wallMat: THREE.MeshBasicMaterial;
  private wallGlow = 0;
  private wallShow = 0;
  private ice: THREE.Mesh;
  private iceShow = 0;
  private grips: THREE.Mesh[];
  private gripShow = [0, 0];
  private hearts: THREE.Sprite[];
  private auras: Aura[];
  private orbs: THREE.Mesh[][];
  private bolts: Bolt[] = [];
  private crackleAt = [0, 0];
  private dot = dotTexture();

  constructor() {
    this.flash.position.set(W / 2, 2.5, D / 2);
    this.group.add(this.flash);

    // Force Wall: three hex-grid panels, the far end and both long sides of a half.
    const hex = hexTexture();
    this.wallMat = new THREE.MeshBasicMaterial({
      map: hex,
      color: hdr('#5ea8ff', 1.6),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    for (let i = 0; i < 3; i++) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, WALL_H), this.wallMat);
      wall.visible = false;
      this.walls.push(wall);
      this.group.add(wall);
    }

    // Ice: a glossy frosted sheet just above the desk top.
    const frost = frostTexture();
    const iceGeo = new THREE.PlaneGeometry(W, D);
    iceGeo.rotateX(-Math.PI / 2);
    this.ice = new THREE.Mesh(
      iceGeo,
      new THREE.MeshPhysicalMaterial({
        map: frost,
        color: '#cfeeff',
        roughness: 0.08,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.ice.position.set(W / 2, 0.003, D / 2);
    this.ice.visible = false;
    this.group.add(this.ice);

    const rune = runeTexture();
    this.grips = [0, 1].map(() => {
      const geo = new THREE.PlaneGeometry(L * 1.35, 0.62);
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          map: rune,
          color: hdr('#7ddc6a', 1.8),
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      mesh.visible = false;
      this.group.add(mesh);
      return mesh;
    });

    const heart = heartTexture();
    this.hearts = [0, 1].map(() => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heart, color: hdr('#ff5a7a', 1.3), transparent: true, depthWrite: false }));
      s.scale.setScalar(0.32);
      s.visible = false;
      this.group.add(s);
      return s;
    });

    this.auras = [0, 1].map(() => {
      const pos = new Float32Array(AURA_SIZE * 3).fill(-100);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const points = new THREE.Points(
        geo,
        new THREE.PointsMaterial({
          size: 0.2,
          map: this.dot,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          color: hdr('#ff8a1f'),
        }),
      );
      points.frustumCulled = false;
      this.group.add(points);
      return {
        points,
        pos,
        vel: new Float32Array(AURA_SIZE * 3),
        age: new Float32Array(AURA_SIZE).fill(99),
        life: new Float32Array(AURA_SIZE).fill(1),
        next: 0,
        emit: 0,
      };
    });

    this.orbs = [0, 1].map(() =>
      [0, 1].map(() => {
        const orb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ color: hdr('#c58bff', 3) }));
        orb.visible = false;
        this.group.add(orb);
        return orb;
      }),
    );
  }

  /** Every frame: places and animates the effects for the super powers in play. */
  update(view: BoostView, pens: THREE.Object3D[], dt: number, time: number): void {
    this.placeWalls(view, dt, time);

    this.iceShow += (view.ice - this.iceShow) * Math.min(1, dt * 4);
    const iceMat = this.ice.material as THREE.MeshPhysicalMaterial;
    iceMat.opacity = this.iceShow * 0.9;
    this.ice.visible = this.iceShow > 0.01;

    pens.forEach((rig, i) => {
      const at = rig.position;
      const yaw = penYaw(rig);
      const onDesk = rig.visible && at.y > -0.05;

      this.gripShow[i] += ((view.grip[i] && onDesk ? 1 : 0) - this.gripShow[i]) * Math.min(1, dt * 5);
      const grip = this.grips[i];
      grip.visible = this.gripShow[i] > 0.01;
      grip.position.set(at.x, 0.005, at.z);
      grip.rotation.y = yaw;
      (grip.material as THREE.MeshBasicMaterial).opacity = this.gripShow[i] * (0.75 + 0.25 * Math.sin(time * 5));

      const heart = this.hearts[i];
      heart.visible = view.lives[i] > 0 && onDesk;
      heart.position.set(at.x, at.y + 0.42 + Math.sin(time * 3 + i) * 0.05, at.z);
      heart.scale.setScalar(0.3 + Math.max(0, Math.sin(time * 6)) ** 8 * 0.06);

      const charged = onDesk ? view.charged[i] : null;
      this.runAura(i, charged, rig, dt);
      this.orbs[i].forEach((orb, k) => {
        orb.visible = charged === 'double';
        const a = time * 3.2 + k * Math.PI;
        orb.position.set(at.x + Math.cos(a) * L * 0.55, at.y + 0.12 + Math.sin(time * 4 + k) * 0.05, at.z + Math.sin(a) * 0.32);
      });
      // A charged lightning pen crackles with little sparks.
      if (charged === 'lightning') {
        this.crackleAt[i] -= dt;
        if (this.crackleAt[i] <= 0) {
          this.crackleAt[i] = 0.06 + Math.random() * 0.1;
          const along = (Math.random() - 0.5) * L * 0.9;
          const from = new THREE.Vector3(at.x + Math.cos(yaw) * along, at.y + 0.02, at.z - Math.sin(yaw) * along);
          const to = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.35, 0.12 + Math.random() * 0.22, (Math.random() - 0.5) * 0.35));
          this.addBolt(from, to, boostOf('lightning').color, 0.09, 0.008);
        }
      }
    });

    this.runBolts(dt);
    this.flash.intensity *= Math.exp(-dt * 9);
    if (this.flash.intensity < 0.01) this.flash.intensity = 0;
  }

  /** Lightning from the sky onto `at`. */
  strikeAt(at: THREE.Vector3): void {
    const color = boostOf('lightning').color;
    const top = new THREE.Vector3(at.x + (Math.random() - 0.5) * 1.5, 5.5, at.z + (Math.random() - 0.5) * 1.5);
    this.addBolt(top, at.clone().setY(R), color, 0.45, 0.035);
    // Forks off the main bolt.
    for (let i = 0; i < 2; i++) {
      const mid = top.clone().lerp(at, 0.4 + Math.random() * 0.3);
      this.addBolt(mid, mid.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, -1 - Math.random(), (Math.random() - 0.5) * 1.6)), color, 0.3, 0.015);
    }
    this.flash.position.set(at.x, 1.2, at.z);
    this.flash.intensity = 45;
  }

  /** A pen bumped the Force Wall: it lights up. */
  wallHit(strength: number): void {
    this.wallGlow = Math.min(1.5, this.wallGlow + 0.5 + strength);
  }

  private placeWalls(view: BoostView, dt: number, time: number): void {
    const target = view.wall ? (view.wall.active ? 1 : 0.35) : 0;
    this.wallShow += (target - this.wallShow) * Math.min(1, dt * 6);
    this.wallGlow *= Math.exp(-dt * 4);
    const show = this.wallShow > 0.01;
    this.walls.forEach((w) => (w.visible = show));
    if (!show) return;
    const by = view.wall?.by ?? 0;
    const end = endOf(by);
    const half = W / 2;
    const cx = W / 2 + end * (W / 4);
    const [back, near, far] = this.walls;
    back.scale.set(D, 1, 1);
    back.position.set(end > 0 ? W : 0, WALL_H / 2, D / 2);
    back.rotation.set(0, Math.PI / 2, 0);
    for (const [wall, z] of [
      [near, 0],
      [far, D],
    ] as const) {
      wall.scale.set(half, 1, 1);
      wall.position.set(cx, WALL_H / 2, z);
      wall.rotation.set(0, 0, 0);
    }
    this.wallMat.opacity = this.wallShow * (0.55 + 0.12 * Math.sin(time * 7)) + this.wallGlow * 0.5;
    this.wallMat.map!.offset.y = (-time * 0.25) % 1;
  }

  private runAura(i: number, charged: BoostId | null, rig: THREE.Object3D, dt: number): void {
    const a = this.auras[i];
    const fire = charged === 'strike' || charged === 'lightning';
    const mat = a.points.material as THREE.PointsMaterial;
    if (fire) mat.color.copy(hdr(charged === 'strike' ? '#ff6a00' : '#59c2ff', 1.7));
    const yaw = penYaw(rig);
    a.emit += fire ? dt : 0;
    while (a.emit > 0.007) {
      a.emit -= 0.007;
      const n = a.next;
      a.next = (a.next + 1) % AURA_SIZE;
      const along = (Math.random() - 0.5) * L;
      a.pos.set([rig.position.x + Math.cos(yaw) * along, rig.position.y + 0.02, rig.position.z - Math.sin(yaw) * along], n * 3);
      a.vel.set([(Math.random() - 0.5) * 0.25, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.25], n * 3);
      a.age[n] = 0;
      a.life[n] = 0.35 + Math.random() * 0.35;
    }
    for (let n = 0; n < AURA_SIZE; n++) {
      a.age[n] += dt;
      if (a.age[n] > a.life[n]) {
        a.pos[n * 3 + 1] = -100;
        continue;
      }
      a.pos[n * 3] += a.vel[n * 3] * dt;
      a.pos[n * 3 + 1] += a.vel[n * 3 + 1] * dt;
      a.pos[n * 3 + 2] += a.vel[n * 3 + 2] * dt;
    }
    (a.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  private addBolt(from: THREE.Vector3, to: THREE.Vector3, color: string, life: number, width: number): void {
    const bolt: Bolt = { meshes: [], life, age: 0, from, to, color, rebuild: 0, width };
    this.buildBolt(bolt);
    this.bolts.push(bolt);
  }

  /** A jagged bolt: a bright core and a soft glow round it, re-drawn to flicker. */
  private buildBolt(b: Bolt): void {
    for (const m of b.meshes) {
      this.group.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    const pts = jagged(b.from, b.to, 0.12 * b.from.distanceTo(b.to));
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 1; i < pts.length; i++) path.add(new THREE.LineCurve3(pts[i - 1], pts[i]));
    const segs = pts.length * 2;
    b.meshes = [
      [b.width, '#ffffff', 4, 1],
      [b.width * 3.2, b.color, 2.2, 0.45],
    ].map(([radius, color, k, opacity]) => {
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(path, segs, radius as number, 5, false),
        new THREE.MeshBasicMaterial({
          color: hdr(color as string, k as number),
          transparent: true,
          opacity: opacity as number,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      mesh.frustumCulled = false;
      this.group.add(mesh);
      return mesh;
    });
  }

  private runBolts(dt: number): void {
    this.bolts = this.bolts.filter((b) => {
      b.age += dt;
      b.rebuild -= dt;
      if (b.age >= b.life) {
        for (const m of b.meshes) {
          this.group.remove(m);
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
        return false;
      }
      if (b.rebuild <= 0 && b.life > 0.2) {
        b.rebuild = 0.07;
        this.buildBolt(b);
      }
      const fade = 1 - b.age / b.life;
      b.meshes.forEach((m, i) => ((m.material as THREE.MeshBasicMaterial).opacity = (i === 0 ? 1 : 0.45) * fade));
      return true;
    });
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.Sprite) {
        o.geometry.dispose();
        const m = o.material as THREE.Material & { map?: THREE.Texture | null };
        m.map?.dispose();
        m.dispose();
      }
    });
  }
}

/** Heading of a pen rig's length about the vertical, as a three.js y rotation. */
function penYaw(rig: THREE.Object3D): number {
  const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(rig.quaternion);
  return -Math.atan2(fwd.z, fwd.x);
}

/** Midpoint displacement: a straight line broken into a zig-zag. */
function jagged(a: THREE.Vector3, b: THREE.Vector3, spread: number): THREE.Vector3[] {
  let pts = [a.clone(), b.clone()];
  let s = spread;
  for (let level = 0; level < 4; level++) {
    const out: THREE.Vector3[] = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const mid = pts[i - 1].clone().lerp(pts[i], 0.5);
      mid.x += (Math.random() - 0.5) * s;
      mid.y += (Math.random() - 0.5) * s * 0.4;
      mid.z += (Math.random() - 0.5) * s;
      out.push(mid, pts[i]);
    }
    pts = out;
    s *= 0.5;
  }
  return pts;
}

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function dotTexture(): THREE.CanvasTexture {
  return canvasTexture(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  });
}

/** Honeycomb lines, bright at the bottom and fading upwards, for the Force Wall. */
function hexTexture(): THREE.CanvasTexture {
  const tex = canvasTexture(256, 128, (g) => {
    const fade = g.createLinearGradient(0, 128, 0, 0);
    fade.addColorStop(0, 'rgba(255,255,255,0.55)');
    fade.addColorStop(1, 'rgba(255,255,255,0.04)');
    g.fillStyle = fade;
    g.fillRect(0, 0, 256, 128);
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2;
    const r = 14;
    const h = Math.sqrt(3) * r;
    for (let row = -1; row < 128 / h + 1; row++) {
      for (let col = -1; col < 256 / (r * 3) + 1; col++) {
        for (const off of [0, 1]) {
          const cx = col * r * 3 + off * r * 1.5;
          const cy = row * h + off * (h / 2);
          g.beginPath();
          for (let k = 0; k <= 6; k++) {
            const a = (Math.PI / 3) * k;
            g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
          }
          g.stroke();
        }
      }
    }
    // A bright rim along the top edge.
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(0, 0, 256, 3);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  return tex;
}

/** Frost: a pale sheet with crystals branching across it. */
function frostTexture(): THREE.CanvasTexture {
  return canvasTexture(1024, 640, (g) => {
    g.fillStyle = 'rgba(170,220,255,0.16)';
    g.fillRect(0, 0, 1024, 640);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(235,248,255,${Math.random() * 0.45})`;
      g.fillRect(Math.random() * 1024, Math.random() * 640, 2, 2);
    }
    g.strokeStyle = 'rgba(240,250,255,0.85)';
    const branch = (x: number, y: number, a: number, len: number, depth: number) => {
      if (depth === 0 || len < 4) return;
      const x2 = x + Math.cos(a) * len;
      const y2 = y + Math.sin(a) * len;
      g.lineWidth = depth * 0.6;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x2, y2);
      g.stroke();
      branch(x2, y2, a + 0.6 + Math.random() * 0.3, len * 0.55, depth - 1);
      branch(x2, y2, a - 0.6 - Math.random() * 0.3, len * 0.55, depth - 1);
      branch(x2, y2, a + (Math.random() - 0.5) * 0.3, len * 0.7, depth - 1);
    };
    for (let i = 0; i < 26; i++) {
      // Frost grows in from the edges.
      const edge = Math.floor(Math.random() * 4);
      const x = edge === 0 ? 0 : edge === 1 ? 1024 : Math.random() * 1024;
      const y = edge === 2 ? 0 : edge === 3 ? 640 : Math.random() * 640;
      const a = Math.atan2(320 - y, 512 - x) + (Math.random() - 0.5);
      branch(x, y, a, 60 + Math.random() * 80, 5);
    }
    const vignette = g.createRadialGradient(512, 320, 120, 512, 320, 600);
    vignette.addColorStop(0, 'rgba(200,235,255,0)');
    vignette.addColorStop(1, 'rgba(215,240,255,0.6)');
    g.fillStyle = vignette;
    g.fillRect(0, 0, 1024, 640);
  });
}

/** An oval ring of runes and arrows pointing in, for Super Grip. */
function runeTexture(): THREE.CanvasTexture {
  const tex = canvasTexture(512, 256, (g) => {
    g.translate(256, 128);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    for (const [rx, ry, w] of [
      [240, 110, 4],
      [215, 92, 2],
    ] as const) {
      g.lineWidth = w;
      g.beginPath();
      g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = 'rgba(255,255,255,0.95)';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const x = Math.cos(a) * 228;
      const y = Math.sin(a) * 101;
      g.save();
      g.translate(x, y);
      g.rotate(a + Math.PI / 2);
      g.fillRect(-2, -7, 4, 14);
      if (i % 3 === 0) {
        g.beginPath();
        g.moveTo(-7, 6);
        g.lineTo(7, 6);
        g.lineTo(0, 16);
        g.fill();
      }
      g.restore();
    }
    const glow = g.createRadialGradient(0, 0, 10, 0, 0, 230);
    glow.addColorStop(0, 'rgba(255,255,255,0.18)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow;
    g.scale(1, 0.45);
    g.beginPath();
    g.arc(0, 0, 230, 0, Math.PI * 2);
    g.fill();
  });
  return tex;
}

function heartTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (g) => {
    const path = () => {
      g.beginPath();
      g.moveTo(64, 108);
      g.bezierCurveTo(10, 72, 8, 30, 38, 22);
      g.bezierCurveTo(54, 18, 62, 30, 64, 38);
      g.bezierCurveTo(66, 30, 74, 18, 90, 22);
      g.bezierCurveTo(120, 30, 118, 72, 64, 108);
      g.closePath();
    };
    g.shadowColor = 'rgba(255,255,255,0.9)';
    g.shadowBlur = 14;
    path();
    g.fillStyle = '#ffffff';
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,0.65)';
    g.beginPath();
    g.ellipse(44, 42, 10, 6, -0.6, 0, Math.PI * 2);
    g.fill();
  });
}
