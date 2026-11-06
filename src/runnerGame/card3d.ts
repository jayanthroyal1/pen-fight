import * as THREE from 'three';
import { cardShadowSize, runCard3D } from '../platform/card3d';
import { LAP, autoStep, freshRun } from './cardScene';
import { WolfRig, type Leg, type Pose } from './rig';
import { WOLF_W, WOLF_X } from './sim';

/**
 * Wolf Run's card in real 3D: a low-poly wolf, posed each frame by the game's own
 * gallop, running the game's own course through a moonlit pine forest while the
 * camera swings around it. World units are the game's, with z towards the viewer.
 */

const STEP = 1 / 120;
/** Obstacles appear this far ahead, out in the night fog. */
const VIEW = 640;
const REST_S = 1.8;
const NIGHT = 0x0d1324;
const TAU = Math.PI * 2;

const BACK = new THREE.Color('#3f2f24');
const FLANK = new THREE.Color('#9a7450');
const WARM = new THREE.Color('#c39a6c');
const BELLY = new THREE.Color('#ece0c8');
const TIP = new THREE.Color('#1d1612');

interface Ring {
  x: number;
  y: number;
  z?: number;
  /** Half its height and half its width. */
  a: number;
  b: number;
}

/** A skin stretched over a line of rings: how the wolf's body, legs and tail are made. */
class Loft {
  readonly mesh: THREE.Mesh;
  private readonly position: THREE.BufferAttribute;

  constructor(
    private readonly rings: number,
    private readonly sides: number,
    material: THREE.Material,
    colorAt: (ring: number, up: number) => THREE.Color,
  ) {
    const geometry = new THREE.BufferGeometry();
    const count = rings * sides;
    this.position = new THREE.BufferAttribute(new Float32Array(count * 3), 3);
    this.position.setUsage(THREE.DynamicDrawUsage);
    const colors = new Float32Array(count * 3);
    const index: number[] = [];
    for (let i = 0; i < rings; i++) {
      for (let s = 0; s < sides; s++) {
        colorAt(i, Math.cos((s / sides) * TAU)).toArray(colors, (i * sides + s) * 3);
        if (i === rings - 1) continue;
        const a = i * sides + s;
        const b = i * sides + ((s + 1) % sides);
        index.push(a, a + sides, b, b, a + sides, b + sides);
      }
    }
    geometry.setAttribute('position', this.position);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(index);
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
  }

  update(line: Ring[]): void {
    const p = this.position.array as Float32Array;
    for (let i = 0; i < this.rings; i++) {
      const r = line[i];
      const before = line[Math.max(0, i - 1)];
      const after = line[Math.min(this.rings - 1, i + 1)];
      const tx = after.x - before.x;
      const ty = after.y - before.y;
      const len = Math.hypot(tx, ty) || 1;
      const nx = -ty / len;
      const ny = tx / len;
      for (let s = 0; s < this.sides; s++) {
        const angle = (s / this.sides) * TAU;
        const up = Math.cos(angle) * r.a;
        const at = (i * this.sides + s) * 3;
        p[at] = r.x + nx * up;
        p[at + 1] = r.y + ny * up;
        p[at + 2] = (r.z ?? 0) + Math.sin(angle) * r.b;
      }
    }
    this.position.needsUpdate = true;
  }
}

function buildWolf(fur: THREE.Material) {
  const group = new THREE.Group();
  const body = new Loft(12, 9, fur, (ring, up) => {
    const c = up > 0.55 ? BACK : up > -0.1 ? FLANK : up > -0.6 ? WARM : BELLY;
    return ring >= 9 && up < 0.4 ? BELLY : c;
  });
  const tail = new Loft(6, 6, fur, (ring, up) => (ring < 2 ? TIP : up > 0 ? BACK : FLANK));
  const legs = [0, 1, 2, 3].map((n) => new Loft(8, 6, fur, (ring) => (n < 2 ? BACK : ring < 3 ? FLANK : ring < 6 ? WARM : BELLY)));
  group.add(body.mesh, tail.mesh, ...legs.map((l) => l.mesh));

  const head = new THREE.Group();
  const earShape = new THREE.ConeGeometry(3.4, 11, 4);
  const earFur = new THREE.MeshStandardMaterial({ color: '#2f231b', flatShading: true });
  const ears = [-3.8, 3.8].map((z) => {
    const ear = new THREE.Mesh(earShape, earFur);
    ear.position.set(-1, 7, z);
    ear.castShadow = true;
    head.add(ear);
    return ear;
  });
  const eyeShape = new THREE.SphereGeometry(1.15, 8, 6);
  const eyeGlow = new THREE.MeshBasicMaterial({ color: '#ffb31a' });
  for (const z of [-3.7, 3.7]) {
    const eye = new THREE.Mesh(eyeShape, eyeGlow);
    eye.position.set(9, 0, z);
    head.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 6), new THREE.MeshStandardMaterial({ color: '#0d0a08', roughness: 0.35 }));
  nose.position.set(21.5, -5, 0);
  head.add(nose);
  group.add(head);

  const legRings = (leg: Leg): Ring[] => {
    const z = leg.far ? -6 : 6;
    const { hip, knee, foot } = leg;
    const top = leg.front ? 6 : 8;
    const ring = (x: number, y: number, r: number): Ring => ({ x, y, z, a: r, b: r * 0.8 });
    return [
      ring(hip.x, hip.y + 5, top),
      ring(hip.x, hip.y, top * 0.9),
      ring((hip.x + knee.x) / 2, (hip.y + knee.y) / 2, top * 0.65),
      ring(knee.x, knee.y, 3),
      ring((knee.x + foot.x) / 2, (knee.y + foot.y) / 2, 2.1),
      ring(foot.x, foot.y + 2.2, 2),
      ring(foot.x + 3, foot.y + 1.2, 2.4),
      ring(foot.x + 7, foot.y + 0.8, 0.5),
    ];
  };

  return {
    group,
    pose(p: Pose, lift: number): void {
      const { hip, chest, head: h } = p;
      const mid = (hip.y + chest.y) / 2;
      body.update([
        { x: hip.x - 15, y: hip.y - 6, a: 1, b: 1 },
        { x: hip.x - 10, y: hip.y - 6, a: 7, b: 6 },
        { x: hip.x, y: hip.y - 6, a: 9, b: 8 },
        { x: -6, y: mid - 6.5, a: 6.5, b: 6.5 },
        { x: 8, y: chest.y - 8.5, a: 10, b: 8.5 },
        { x: chest.x + 4, y: chest.y - 6.5, a: 11.5, b: 9 },
        { x: (chest.x + h.x) / 2 + 4, y: (chest.y + h.y) / 2 - 2, a: 10.5, b: 7.5 },
        { x: h.x + 1, y: h.y - 1, a: 7, b: 6 },
        { x: h.x + 7, y: h.y - 1.5, a: 5.2, b: 4.8 },
        { x: h.x + 14, y: h.y - 4, a: 3, b: 2.8 },
        { x: h.x + 20, y: h.y - 5, a: 1.9, b: 1.8 },
        { x: h.x + 22, y: h.y - 5.2, a: 0.2, b: 0.2 },
      ]);
      const radii = [0.5, 3.2, 4.6, 5, 3.8, 2.4];
      const t = p.tail;
      tail.update(radii.map((r, i) => {
        const point = t[t.length - 1 - i];
        return { x: point.x, y: point.y - lift, a: r, b: r };
      }));
      p.legs.forEach((leg, i) => legs[i].update(legRings(leg)));
      head.position.set(h.x, h.y, 0);
      head.rotation.z = -p.headTilt + p.pitch * 0.4;
      ears.forEach((ear) => {
        ear.rotation.z = 0.12 + p.earFlick * 0.9;
      });
    },
  };
}

/** A repeating sheet of rolling ground, so sliding it by one period looks like no change at all. */
function buildGround(): { mesh: THREE.Mesh; period: number } {
  const cell = 48;
  const across = 30;
  const period = cell * 8;
  const geometry = new THREE.PlaneGeometry(cell * 44, 1300, 44, across);
  geometry.rotateX(-Math.PI / 2);
  const p = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(p.count * 3);
  const lane = new THREE.Color('#3a3f52');
  const grass = new THREE.Color('#1f2c3f');
  const color = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    const column = Math.round((p.getX(i) + cell * 22) / cell) % 8;
    const off = Math.max(0, Math.abs(z) - 46);
    const bump = Math.sin(column * 2.399 + z * 0.37) * Math.cos(z * 0.11 + column);
    p.setY(i, bump * Math.min(26, off * 0.22) - 1);
    color.copy(grass).lerp(lane, Math.max(0, 1 - off / 16));
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
  mesh.receiveShadow = true;
  return { mesh, period };
}

function buildForest(count: number) {
  const low = new THREE.ConeGeometry(30, 62, 7);
  low.translate(0, 42, 0);
  const high = new THREE.ConeGeometry(21, 58, 7);
  high.translate(0, 84, 0);
  const trunk = new THREE.CylinderGeometry(4, 5, 20, 5);
  trunk.translate(0, 8, 0);
  const needles = new THREE.MeshStandardMaterial({ color: '#1e4a43', flatShading: true });
  const wood = new THREE.MeshStandardMaterial({ color: '#2c211b', flatShading: true });
  const parts = [new THREE.InstancedMesh(low, needles, count), new THREE.InstancedMesh(high, needles, count), new THREE.InstancedMesh(trunk, wood, count)];
  parts.forEach((m) => {
    m.castShadow = true;
    m.frustumCulled = false;
  });
  const trees = Array.from({ length: count }, (_, i) => ({
    x: ((i * 137) % 1200) - 420,
    z: -70 - ((i * 53) % 430),
    size: 0.7 + ((i * 29) % 10) / 12,
  }));
  const matrix = new THREE.Matrix4();
  return {
    parts,
    move(travel: number): void {
      trees.forEach((t, i) => {
        const x = ((((t.x - travel) % 1200) + 1200) % 1200) - 420;
        matrix.makeScale(t.size, t.size, t.size).setPosition(x, -2, t.z);
        parts.forEach((m) => m.setMatrixAt(i, matrix));
      });
      parts.forEach((m) => {
        m.instanceMatrix.needsUpdate = true;
      });
    },
  };
}

function buildSky(scene: THREE.Scene): void {
  const moon = new THREE.Mesh(new THREE.SphereGeometry(62, 24, 16), new THREE.MeshBasicMaterial({ color: '#f6efd8', fog: false }));
  moon.position.set(310, 250, -1050);
  const halo = new THREE.Mesh(new THREE.CircleGeometry(120, 32), new THREE.MeshBasicMaterial({ color: '#2b3a5e', fog: false, transparent: true, opacity: 0.55 }));
  halo.position.set(310, 250, -1110);
  const points = new Float32Array(420 * 3);
  for (let i = 0; i < 420; i++) {
    points[i * 3] = ((i * 2654435) % 3000) - 1500;
    points[i * 3 + 1] = 90 + ((i * 40503) % 760);
    points[i * 3 + 2] = -1150;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#dfe8ff', size: 1.5, sizeAttenuation: false, fog: false }));
  scene.add(halo, moon, stars);
  const rock = new THREE.MeshStandardMaterial({ color: '#27324a', flatShading: true });
  [-620, -300, 40, 420, 760].forEach((x, i) => {
    const peak = new THREE.Mesh(new THREE.ConeGeometry(260 + i * 18, 300 + (i % 3) * 70, 6), rock);
    peak.position.set(x, 130, -760);
    scene.add(peak);
  });
}

export function playWolf3D(canvas: HTMLCanvasElement): () => void {
  return runCard3D(canvas, () => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(NIGHT);
    scene.fog = new THREE.Fog(NIGHT, 260, 1000);
    const camera = new THREE.PerspectiveCamera(26, 1.8, 10, 2400);

    scene.add(new THREE.HemisphereLight('#7f9bd6', '#231a14', 1.5));
    const moonlight = new THREE.DirectionalLight('#c8d8ff', 2.4);
    moonlight.position.set(-70, 260, 130);
    moonlight.castShadow = true;
    moonlight.shadow.mapSize.setScalar(cardShadowSize());
    Object.assign(moonlight.shadow.camera, { left: -170, right: 170, top: 170, bottom: -170, near: 10, far: 600 });
    const rim = new THREE.DirectionalLight('#ff7a2a', 2.2);
    rim.position.set(170, 50, -130);
    const fill = new THREE.DirectionalLight('#ffdcb0', 1.1);
    fill.position.set(120, 60, 200);
    scene.add(moonlight, moonlight.target, rim, fill);

    buildSky(scene);
    const ground = buildGround();
    scene.add(ground.mesh);
    const forest = buildForest(46);
    scene.add(...forest.parts);

    const fur = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, side: THREE.DoubleSide });
    const wolf = buildWolf(fur);
    scene.add(wolf.group);

    const rockShape = new THREE.IcosahedronGeometry(1, 1);
    const rockSkin = new THREE.MeshStandardMaterial({ color: '#7d879c', flatShading: true });
    const rocks = Array.from({ length: 5 }, () => {
      const m = new THREE.Mesh(rockShape, rockSkin);
      m.castShadow = true;
      m.visible = false;
      scene.add(m);
      return m;
    });
    const owlSkin = new THREE.MeshStandardMaterial({ color: '#b98a5c', flatShading: true });
    const owls = Array.from({ length: 2 }, () => {
      const owl = new THREE.Mesh(new THREE.OctahedronGeometry(13, 0), owlSkin);
      owl.scale.set(1.3, 0.8, 1.1);
      owl.castShadow = true;
      owl.visible = false;
      scene.add(owl);
      return owl;
    });

    const dustPositions = new Float32Array(60 * 3);
    const dustShape = new THREE.BufferGeometry();
    dustShape.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dust = new THREE.Points(dustShape, new THREE.PointsMaterial({ color: '#aeb6c6', size: 7, transparent: true, opacity: 0.55, depthWrite: false }));
    dust.frustumCulled = false;
    scene.add(dust);

    let r = freshRun();
    const rig = new WolfRig();
    let spare = 0;
    let rest = 0;
    let travel = 0;
    let time = 0;
    let cameraY = 44;

    const start = () => {
      r = freshRun();
      rig.reset();
      rest = 0;
    };

    const place = () => {
      const pose = rig.pose();
      const over = r.phase === 'over';
      const lift = over ? pose.y : r.y;
      wolf.pose(pose, r.y);
      wolf.group.position.set(pose.x, lift, 0);
      wolf.group.rotation.z = pose.pitch - pose.rotation;
      wolf.group.scale.set(1 - pose.squash * 0.7, 1 + pose.squash, 1);

      let rockAt = 0;
      let owlAt = 0;
      rocks.forEach((m) => (m.visible = false));
      owls.forEach((m) => (m.visible = false));
      for (const o of r.obstacles) {
        const x = o.x + o.w / 2 - (WOLF_X + WOLF_W / 2);
        if (o.kind === 'owl') {
          const owl = owls[owlAt++];
          if (!owl) continue;
          owl.visible = true;
          owl.position.set(x, o.lift + o.h / 2 + Math.sin(time * 9) * 3, 0);
          owl.rotation.x = Math.sin(time * 18) * 0.5;
        } else {
          const rock = rocks[rockAt++];
          if (!rock) continue;
          rock.visible = true;
          rock.position.set(x, o.h * 0.42, 0);
          rock.scale.set(o.w * 0.62, o.h * 0.62, 24);
          rock.rotation.y = o.w;
        }
      }

      const live = Math.min(rig.dust.length, 60);
      rig.dust.slice(0, live).forEach((d, i) => {
        dustPositions[i * 3] = d.x;
        dustPositions[i * 3 + 1] = d.y;
        dustPositions[i * 3 + 2] = ((i * 7) % 15) - 7;
      });
      dustShape.attributes.position.needsUpdate = true;
      dustShape.setDrawRange(0, live);

      ground.mesh.position.x = -(travel % ground.period);
      forest.move(travel);

      // The camera swings slowly around the wolf, from ahead of it to its flank.
      const angle = 0.5 + Math.sin(time * 0.32) * 0.5;
      const reach = 232;
      cameraY += (40 + lift * 0.55 - cameraY) * 0.06;
      camera.position.set(12 + Math.sin(angle) * reach, cameraY + 8, Math.cos(angle) * reach);
      camera.lookAt(12, cameraY - 4 + lift * 0.1, 0);
      moonlight.target.position.set(pose.x, 0, 0);
      moonlight.position.set(pose.x - 70, 260, 130);
    };

    return {
      scene,
      camera,
      frame(dt) {
        time += dt;
        if (r.phase === 'running') {
          spare += dt;
          travel += r.speed * dt;
          while (spare >= STEP && r.phase === 'running') {
            spare -= STEP;
            rig.update(STEP, r, autoStep(r, rig, Math.random, VIEW));
          }
          if (r.distance > LAP) start();
        } else {
          rig.update(dt, r, false);
          rest += dt;
          if (rest > REST_S) start();
        }
        place();
      },
    };
  });
}
