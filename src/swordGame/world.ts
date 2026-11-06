import type * as RapierNs from '@dimforge/rapier3d';
import * as THREE from 'three';
import type { Pt } from '../runnerGame/rig';
import type { Pose } from './pose';

/**
 * The fight's physics, in Rapier: bodies that run, jump, shove each other and
 * stop at the walls, blades tested against real shapes, and a fighter who goes
 * down as a jointed ragdoll with his sword spinning away.
 */

type Rapier = typeof RapierNs;
let R: Rapier | null = null;

export async function loadPhysics(): Promise<void> {
  R ??= await import('@dimforge/rapier3d');
}

export const STEP = 1 / 60;
export const ARENA_HALF = 9;
const HALF_HEIGHT = 0.6;
const RADIUS = 0.3;
/** From a body's centre down to its feet. */
const TO_FEET = HALF_HEIGHT + RADIUS;
const GRAVITY = 24;
const JUMP_SPEED = 9.4;
/** Fighters meet fighters and the ground; loose ragdoll parts meet only the ground. */
const FIGHTER_GROUP = 0x0003_0003;
const LOOSE_GROUP = 0x0004_0001;
const UP = new THREE.Vector3(0, 1, 0);

export interface FighterBody {
  body: RapierNs.RigidBody;
  collider: RapierNs.Collider;
}

export interface Ragdoll {
  parts: { body: RapierNs.RigidBody; half: number }[];
  head: RapierNs.RigidBody;
  sword: RapierNs.RigidBody;
}

export class SwordWorld {
  private readonly world: RapierNs.World;
  private readonly rapier: Rapier;

  constructor() {
    if (!R) throw new Error('Call loadPhysics() first.');
    this.rapier = R;
    this.world = new R.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = STEP;
    const fixed = (x: number, y: number, hx: number, hy: number) => {
      const body = this.world.createRigidBody(R!.RigidBodyDesc.fixed().setTranslation(x, y, 0));
      this.world.createCollider(R!.ColliderDesc.cuboid(hx, hy, 8).setFriction(0.9), body);
    };
    fixed(0, -1, 60, 1);
    fixed(-ARENA_HALF - 1, 6, 1, 8);
    fixed(ARENA_HALF + 1, 6, 1, 8);
  }

  addFighter(x: number): FighterBody {
    const r = this.rapier;
    const body = this.world.createRigidBody(
      r.RigidBodyDesc.dynamic().setTranslation(x, TO_FEET + 0.01, 0).lockRotations().enabledTranslations(true, true, false).setCcdEnabled(true),
    );
    const collider = this.world.createCollider(r.ColliderDesc.capsule(HALF_HEIGHT, RADIUS).setFriction(0).setMass(70).setCollisionGroups(FIGHTER_GROUP), body);
    return { body, collider };
  }

  feet(f: FighterBody): { x: number; y: number } {
    const t = f.body.translation();
    return { x: t.x, y: t.y - TO_FEET };
  }

  grounded(f: FighterBody): boolean {
    return this.feet(f).y < 0.05 && Math.abs(f.body.linvel().y) < 1.5;
  }

  /** Runs at `vx`, keeping whatever gravity is doing. */
  run(f: FighterBody, vx: number): void {
    f.body.setLinvel({ x: vx, y: f.body.linvel().y, z: 0 }, true);
  }

  jump(f: FighterBody): void {
    const v = f.body.linvel();
    f.body.setLinvel({ x: v.x, y: JUMP_SPEED, z: 0 }, true);
  }

  knock(f: FighterBody, vx: number, vy: number): void {
    f.body.setLinvel({ x: vx, y: vy, z: 0 }, true);
  }

  /** Does a blade from `a` to `b` touch this fighter? */
  touches(a: THREE.Vector3, b: THREE.Vector3, f: FighterBody): boolean {
    const r = this.rapier;
    const dir = new THREE.Vector3().subVectors(b, a);
    const length = dir.length();
    const rot = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().divideScalar(length || 1));
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    let hit = false;
    this.world.intersectionsWithShape({ x: mid.x, y: mid.y, z: 0 }, { x: rot.x, y: rot.y, z: rot.z, w: rot.w }, new r.Capsule(length / 2, 0.14), (other) => {
      if (other.handle === f.collider.handle) hit = true;
      return !hit;
    });
    return hit;
  }

  step(): void {
    this.world.step();
  }

  /** Swaps a living fighter for a ragdoll in the same pose, thrown by the blow. */
  fall(f: FighterBody, pose: Pose, facing: 1 | -1, vx: number, vy: number, swordLength: number): Ragdoll {
    const r = this.rapier;
    const { x, y } = this.feet(f);
    this.world.removeRigidBody(f.body);
    const at = (p: Pt, z: number) => new THREE.Vector3(x + p.x * facing, y + p.y, z);
    const part = (a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
      const dir = new THREE.Vector3().subVectors(b, a);
      const half = dir.length() / 2;
      const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
      const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
      const body = this.world.createRigidBody(
        r.RigidBodyDesc.dynamic().setTranslation(mid.x, Math.max(mid.y, 0.1), mid.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinvel(vx, vy, (Math.random() - 0.5) * 2).setLinearDamping(0.15).setAngularDamping(1.2),
      );
      this.world.createCollider(r.ColliderDesc.capsule(half, radius).setDensity(2).setFriction(0.8).setCollisionGroups(LOOSE_GROUP), body);
      return { body, half };
    };
    const join = (a: { body: RapierNs.RigidBody; half: number }, ay: number, b: { body: RapierNs.RigidBody; half: number }, by: number) => {
      this.world.createImpulseJoint(r.JointData.spherical({ x: 0, y: ay, z: 0 }, { x: 0, y: by, z: 0 }), a.body, b.body, true);
    };

    const shoulder = { x: pose.neck.x, y: pose.neck.y - 0.05 };
    const torso = part(at(pose.hip, 0), at(pose.neck, 0), 0.08);
    const armF1 = part(at(shoulder, 0.11), at(pose.elbowF, 0.11), 0.05);
    const armF2 = part(at(pose.elbowF, 0.11), at(pose.handF, 0.11), 0.05);
    const armB1 = part(at(shoulder, -0.11), at(pose.elbowB, -0.11), 0.05);
    const armB2 = part(at(pose.elbowB, -0.11), at(pose.handB, -0.11), 0.05);
    const legF1 = part(at(pose.hip, 0.11), at(pose.kneeF, 0.11), 0.06);
    const legF2 = part(at(pose.kneeF, 0.11), at(pose.footF, 0.11), 0.05);
    const legB1 = part(at(pose.hip, -0.11), at(pose.kneeB, -0.11), 0.06);
    const legB2 = part(at(pose.kneeB, -0.11), at(pose.footB, -0.11), 0.05);
    join(torso, torso.half, armF1, -armF1.half);
    join(armF1, armF1.half, armF2, -armF2.half);
    join(torso, torso.half, armB1, -armB1.half);
    join(armB1, armB1.half, armB2, -armB2.half);
    join(torso, -torso.half, legF1, -legF1.half);
    join(legF1, legF1.half, legF2, -legF2.half);
    join(torso, -torso.half, legB1, -legB1.half);
    join(legB1, legB1.half, legB2, -legB2.half);

    const headAt = at(pose.head, 0);
    const head = this.world.createRigidBody(r.RigidBodyDesc.dynamic().setTranslation(headAt.x, headAt.y, 0).setLinvel(vx, vy, 0).setAngularDamping(1));
    this.world.createCollider(r.ColliderDesc.ball(0.17).setDensity(2).setCollisionGroups(LOOSE_GROUP), head);
    this.world.createImpulseJoint(r.JointData.spherical({ x: 0, y: torso.half + 0.1, z: 0 }, { x: 0, y: -0.1, z: 0 }), torso.body, head, true);

    const hand = at(pose.handF, 0.15);
    const sword = this.world.createRigidBody(r.RigidBodyDesc.dynamic().setTranslation(hand.x, hand.y, 0.15).setLinvel(vx * 0.5 - facing * 2, vy + 5, 0).setAngvel({ x: 0, y: 0, z: 12 * facing }));
    this.world.createCollider(r.ColliderDesc.cuboid(swordLength / 2, 0.04, 0.03).setDensity(3).setFriction(0.7).setCollisionGroups(LOOSE_GROUP), sword);

    return { parts: [torso, armF1, armF2, armB1, armB2, legF1, legF2, legB1, legB2], head, sword };
  }

  dispose(): void {
    this.world.free();
  }
}

/** The two ends of a ragdoll part, in the world. */
export function partEnds(p: { body: RapierNs.RigidBody; half: number }): [THREE.Vector3, THREE.Vector3] {
  const t = p.body.translation();
  const q = p.body.rotation();
  const axis = new THREE.Vector3(0, p.half, 0).applyQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
  const mid = new THREE.Vector3(t.x, t.y, t.z);
  return [mid.clone().sub(axis), mid.clone().add(axis)];
}
