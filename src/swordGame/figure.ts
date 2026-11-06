import * as THREE from 'three';
import type { Pt } from '../runnerGame/rig';
import type { Pose } from './pose';
import type { Sword } from './story';

/** A stick man in 3D: a head and capsule limbs, with a sword in his hand. */

const NEAR = 0.11;
const UP = new THREE.Vector3(0, 1, 0);
const LIMB = new THREE.CylinderGeometry(1, 1, 1, 7);
const JOINT = new THREE.SphereGeometry(1, 8, 6);

export type Segment = [THREE.Vector3, THREE.Vector3];

const scratch = new THREE.Vector3();

function place(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, radius: number): void {
  scratch.subVectors(b, a);
  const length = scratch.length() || 0.001;
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, scratch.divideScalar(length));
  mesh.scale.set(radius, length, radius);
}

export class Stick {
  readonly group = new THREE.Group();
  readonly material: THREE.MeshStandardMaterial;
  private readonly limbs: THREE.Mesh[] = [];
  private readonly joints: THREE.Mesh[] = [];
  private readonly head: THREE.Mesh;
  readonly blade = new THREE.Group();
  private readonly edge: THREE.MeshStandardMaterial;
  /** Where the sword's hilt and tip are, in the world. */
  readonly hilt = new THREE.Vector3();
  readonly tip = new THREE.Vector3();
  private flash = 0;
  private readonly base: THREE.Color;

  constructor(
    color: string,
    private sword: Sword,
  ) {
    this.base = new THREE.Color(color);
    this.material = new THREE.MeshStandardMaterial({ color, roughness: 0.55, emissive: '#ffffff', emissiveIntensity: 0 });
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(LIMB, this.material);
      m.castShadow = true;
      m.frustumCulled = false;
      this.limbs.push(m);
      this.group.add(m);
    }
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(JOINT, this.material);
      m.frustumCulled = false;
      this.joints.push(m);
      this.group.add(m);
    }
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), this.material);
    this.head.castShadow = true;
    this.head.frustumCulled = false;
    this.group.add(this.head);

    this.edge = new THREE.MeshStandardMaterial({ color: sword.color, metalness: 0.7, roughness: 0.28, emissive: sword.color, emissiveIntensity: 0.28 });
    this.group.add(this.blade);
    this.setSword(sword, color);
  }

  setSword(sword: Sword, color?: string): void {
    this.sword = sword;
    this.blade.clear();
    this.edge.color.set(sword.color);
    this.edge.emissive.set(sword.color);
    this.edge.emissiveIntensity = sword.id === 'ember' ? 1.1 : 0.28;
    const steel = new THREE.Mesh(new THREE.BoxGeometry(sword.length, sword.length > 1.3 ? 0.1 : 0.065, 0.025), this.edge);
    steel.position.x = sword.length / 2;
    steel.castShadow = true;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.06), new THREE.MeshStandardMaterial({ color: '#2a2019', metalness: 0.4, roughness: 0.5 }));
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 0.05), new THREE.MeshStandardMaterial({ color: color ?? '#2a2019', roughness: 0.8 }));
    grip.position.x = -0.1;
    this.blade.add(steel, guard, grip);
    this.blade.traverse((o) => (o.frustumCulled = false));
  }

  setColor(color: string): void {
    this.base.set(color);
    this.material.color.set(color);
  }

  /** Lights up briefly when struck. */
  hurt(): void {
    this.flash = 1;
  }

  fade(dt: number): void {
    this.flash = Math.max(0, this.flash - dt * 6);
    this.material.emissiveIntensity = this.flash * 0.9;
  }

  /** Poses him at (x, y), feet down, facing `facing` (1 is +x). */
  pose(p: Pose, x: number, y: number, facing: 1 | -1, spin = 0): void {
    const at = (pt: Pt, z: number) => new THREE.Vector3(x + pt.x * facing, y + pt.y, z);
    const shoulder = { x: p.neck.x, y: p.neck.y - 0.05 };
    const segments: [THREE.Vector3, THREE.Vector3, number][] = [
      [at(p.hip, 0), at(p.neck, 0), 0.058],
      [at(shoulder, NEAR), at(p.elbowF, NEAR), 0.042],
      [at(p.elbowF, NEAR), at(p.handF, NEAR), 0.036],
      [at(shoulder, -NEAR), at(p.elbowB, -NEAR), 0.042],
      [at(p.elbowB, -NEAR), at(p.handB, -NEAR), 0.036],
      [at(p.hip, NEAR), at(p.kneeF, NEAR), 0.05],
      [at(p.kneeF, NEAR), at(p.footF, NEAR), 0.042],
      [at(p.hip, -NEAR), at(p.kneeB, -NEAR), 0.05],
      [at(p.kneeB, -NEAR), at(p.footB, -NEAR), 0.042],
    ];
    segments.forEach(([a, b, r], i) => place(this.limbs[i], a, b, r));
    [at(p.elbowF, NEAR), at(p.elbowB, -NEAR), at(p.kneeF, NEAR), at(p.kneeB, -NEAR), at(p.handF, NEAR), at(p.hip, 0)].forEach((v, i) => {
      this.joints[i].position.copy(v);
      this.joints[i].scale.setScalar(i === 5 ? 0.08 : 0.06);
    });
    this.head.position.copy(at(p.head, 0));

    const hand = at(p.handF, NEAR + 0.04);
    const angle = (facing > 0 ? p.sword : Math.PI - p.sword) + spin;
    this.blade.position.copy(hand);
    this.blade.rotation.set(0, 0, angle);
    this.hilt.copy(hand);
    this.tip.set(hand.x + Math.cos(angle) * this.sword.length, hand.y + Math.sin(angle) * this.sword.length, hand.z);
  }

  /** Draws him from physics bodies, once he's a ragdoll. */
  ragdoll(segments: Segment[], head: THREE.Vector3): void {
    this.limbs.forEach((m, i) => {
      const s = segments[i];
      if (s) place(m, s[0], s[1], i === 0 ? 0.07 : 0.055);
    });
    this.joints.forEach((j) => j.scale.setScalar(0.001));
    this.head.position.copy(head);
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry && m.geometry !== LIMB && m.geometry !== JOINT) m.geometry.dispose();
    });
    this.material.dispose();
    this.edge.dispose();
  }
}

/** A swinging sword's streak of light. */
export class Trail {
  readonly mesh: THREE.Mesh;
  private readonly position: THREE.BufferAttribute;
  private readonly tint: THREE.BufferAttribute;
  private readonly points: { hilt: THREE.Vector3; tip: THREE.Vector3 }[] = [];
  private readonly color: THREE.Color;

  constructor(
    color: string,
    private readonly length = 14,
  ) {
    this.color = new THREE.Color(color);
    const geometry = new THREE.BufferGeometry();
    this.position = new THREE.BufferAttribute(new Float32Array(length * 2 * 3), 3);
    this.tint = new THREE.BufferAttribute(new Float32Array(length * 2 * 3), 3);
    const index: number[] = [];
    for (let i = 0; i < length - 1; i++) index.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    geometry.setAttribute('position', this.position);
    geometry.setAttribute('color', this.tint);
    geometry.setIndex(index);
    this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    this.mesh.frustumCulled = false;
  }

  /** Adds where the blade is now, if it's cutting; otherwise the streak dies away. */
  update(hilt: THREE.Vector3, tip: THREE.Vector3, cutting: boolean): void {
    if (cutting) this.points.unshift({ hilt: hilt.clone(), tip: tip.clone() });
    else this.points.pop();
    if (this.points.length > this.length) this.points.length = this.length;
    const p = this.position.array as Float32Array;
    const c = this.tint.array as Float32Array;
    for (let i = 0; i < this.length; i++) {
      const s = this.points[Math.min(i, this.points.length - 1)];
      const fade = this.points.length ? Math.max(0, 1 - i / Math.max(1, this.points.length)) * 0.6 : 0;
      for (let side = 0; side < 2; side++) {
        const v = s ? (side ? s.tip : s.hilt) : tip;
        const at = (i * 2 + side) * 3;
        p[at] = v.x;
        p[at + 1] = v.y;
        p[at + 2] = v.z;
        const glow = side ? fade : fade * 0.15;
        c[at] = this.color.r * glow;
        c[at + 1] = this.color.g * glow;
        c[at + 2] = this.color.b * glow;
      }
    }
    this.position.needsUpdate = true;
    this.tint.needsUpdate = true;
  }
}
