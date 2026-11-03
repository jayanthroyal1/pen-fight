import type * as RapierNs from '@dimforge/rapier3d';
import { impulseScaleOf, massOf } from './pens';
import { POWER_BOOST } from './powers';
import {
  DESK,
  FALL_DEPTH,
  HALF_SEG,
  MAX_IMPULSE,
  PEN_HALF_HEIGHT,
  PEN_LENGTH,
  PEN_RADIUS,
  axis,
} from './physics';
import type { Flick, Pen, PlayerId } from './types';

type Rapier = typeof RapierNs;
let R: Rapier | null = null;

/** Loads the Rapier WASM module. Call once before creating a `DeskWorld`. */
export async function initPhysics(): Promise<void> {
  R ??= await import('@dimforge/rapier3d');
}

/** Fixed physics step, shared by live play and the computer's look-ahead. */
export const DT = 1 / 60;

/** Desk pixels per Rapier unit. A 150px pen is 1.5 units long. */
export const UNITS = 100;
const S = UNITS;
const GRAVITY = 30;
const FRICTION = 0.35;
const RESTITUTION = 0.3;
const LINEAR_DAMPING = 0.4;
const ANGULAR_DAMPING = 1.5;
const BEVEL = 3;
/** A pen whose centre drops this far below its resting height has gone over the edge. */
const OUT_DROP = 20;
const QUIET_SPEED = 0.03;
const QUIET_SPIN = 0.05;
/** Steps in a row that every pen must be still before a shot counts as over. */
const QUIET_STEPS = 8;
/** Give up waiting after this many steps (a pen rocking forever, say). */
const MAX_SHOT_STEPS = 15 / DT;
/** Contact force below this is a pen just lying or sliding on the desk. */
const DESK_TAP_FORCE = 150;

/** Something that should make a sound; strength is 0..1. */
export type Impact =
  | { kind: 'pens'; strength: number }
  | { kind: 'desk'; strength: number; pen: PlayerId }
  | { kind: 'fall'; pen: PlayerId };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * The 3D desk: a fixed slab with two dynamic pens on it, simulated by Rapier.
 * The desk top is at height 0; desk x maps to world x and desk y to world z.
 */
export class DeskWorld {
  private world: RapierNs.World;
  private bodies: RapierNs.RigidBody[];
  private colliders: RapierNs.Collider[];
  private events: RapierNs.EventQueue | null;
  private impacts: Impact[] = [];
  private out: [boolean, boolean] = [false, false];
  private models: Pen['model'][];
  private powers: Pen['power'][];
  private quiet = 0;
  private steps = 0;

  /** `withEvents` collects impacts for sound; the computer's look-ahead leaves it off. */
  constructor(pens: [Pen, Pen], withEvents = false) {
    if (!R) throw new Error('initPhysics() must finish before creating a DeskWorld');
    const r = R;
    this.world = new r.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = DT;
    this.events = withEvents ? new r.EventQueue(true) : null;
    this.models = pens.map((p) => p.model);
    this.powers = pens.map((p) => p.power);

    const desk = this.world.createRigidBody(
      r.RigidBodyDesc.fixed().setTranslation(DESK.width / 2 / S, -0.5, DESK.height / 2 / S),
    );
    this.world.createCollider(
      r.ColliderDesc.cuboid(DESK.width / 2 / S, 0.5, DESK.height / 2 / S).setFriction(FRICTION),
      desk,
    );

    this.bodies = [];
    this.colliders = [];
    for (const pen of pens) {
      const body = this.world.createRigidBody(
        r.RigidBodyDesc.dynamic()
          .setLinearDamping(LINEAR_DAMPING)
          .setAngularDamping(ANGULAR_DAMPING)
          .setCcdEnabled(true),
      );
      let desc = r.ColliderDesc.roundCuboid(
        (PEN_LENGTH / 2 - BEVEL) / S,
        (PEN_HALF_HEIGHT - BEVEL) / S,
        (PEN_RADIUS - BEVEL) / S,
        BEVEL / S,
      )
        .setMass(massOf(pen.model))
        .setFriction(FRICTION)
        .setRestitution(RESTITUTION);
      if (withEvents) {
        desc = desc
          .setActiveEvents(r.ActiveEvents.COLLISION_EVENTS | r.ActiveEvents.CONTACT_FORCE_EVENTS)
          .setContactForceEventThreshold(DESK_TAP_FORCE * massOf(pen.model));
      }
      this.colliders.push(this.world.createCollider(desc, body));
      this.bodies.push(body);
    }
    this.load(pens);
  }

  /** Places both pens exactly as given, at rest. */
  load(pens: [Pen, Pen]): void {
    pens.forEach((pen, i) => {
      const body = this.bodies[i];
      const [qx, qy, qz, qw] = pen.q;
      body.setTranslation({ x: pen.x / S, y: pen.h / S, z: pen.y / S }, false);
      body.setRotation({ x: qx, y: qy, z: qz, w: qw }, false);
      body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      body.setEnabled(!pen.out);
      this.out[i] = pen.out;
    });
    this.impacts = [];
    this.quiet = 0;
    this.steps = 0;
  }

  flick(id: PlayerId, flick: Flick): void {
    const pen = this.read()[id];
    let { ix, iy } = flick;
    const mag = Math.hypot(ix, iy);
    if (mag > MAX_IMPULSE) {
      ix = (ix / mag) * MAX_IMPULSE;
      iy = (iy / mag) * MAX_IMPULSE;
    }
    // A hero power adds a small boost on top of the pen's own strength.
    const k = (impulseScaleOf(this.models[id]) * (this.powers[id] ? POWER_BOOST : 1)) / S;
    const along = Math.min(HALF_SEG, Math.max(-HALF_SEG, flick.along));
    const d = axis(pen);
    const body = this.bodies[id];
    const c = body.translation();
    body.applyImpulseAtPoint(
      { x: ix * k, y: 0, z: iy * k },
      { x: c.x + (d.x * along) / S, y: c.y, z: c.z + (d.y * along) / S },
      true,
    );
    this.quiet = 0;
    this.steps = 0;
  }

  step(): void {
    if (this.events) {
      this.world.step(this.events);
      this.collectImpacts(this.events);
    } else {
      this.world.step();
    }
    this.steps++;

    let still = true;
    this.bodies.forEach((body, i) => {
      if (!body.isEnabled()) return;
      const h = body.translation().y * S;
      if (h < PEN_HALF_HEIGHT - OUT_DROP && !this.out[i]) {
        this.out[i] = true;
        if (this.events) this.impacts.push({ kind: 'fall', pen: i as PlayerId });
      }
      if (this.out[i]) {
        // Gone far enough to be out of sight: stop simulating it.
        if (h < -FALL_DEPTH) body.setEnabled(false);
        else still = false;
        return;
      }
      const v = body.linvel();
      const w = body.angvel();
      if (
        !body.isSleeping() &&
        (Math.hypot(v.x, v.y, v.z) > QUIET_SPEED || Math.hypot(w.x, w.y, w.z) > QUIET_SPIN)
      ) {
        still = false;
      }
    });
    this.quiet = still ? this.quiet + 1 : 0;
  }

  isSettled(): boolean {
    return this.quiet >= QUIET_STEPS || this.steps >= MAX_SHOT_STEPS;
  }

  /** Steps until the shot is over. */
  settle(): void {
    while (!this.isSettled()) this.step();
  }

  /** Impacts since the last call (only when created `withEvents`). */
  drainImpacts(): Impact[] {
    const out = this.impacts;
    this.impacts = [];
    return out;
  }

  /** Horizontal sliding speed of each pen still on the desk, in desk pixels per second. */
  slideSpeeds(): [number, number] {
    return this.bodies.map((b, i) => {
      if (this.out[i] || !b.isEnabled()) return 0;
      const v = b.linvel();
      return Math.hypot(v.x, v.z) * S;
    }) as [number, number];
  }

  read(): [Pen, Pen] {
    return this.bodies.map((body, i) => {
      const t = body.translation();
      const q = body.rotation();
      // Heading of the pen's local +x axis projected onto the desk.
      const ax = 1 - 2 * (q.y * q.y + q.z * q.z);
      const az = 2 * (q.x * q.z - q.w * q.y);
      return {
        id: i as PlayerId,
        model: this.models[i],
        power: this.powers[i],
        x: t.x * S,
        y: t.z * S,
        h: t.y * S,
        angle: Math.atan2(az, ax),
        q: [q.x, q.y, q.z, q.w],
        out: this.out[i],
      };
    }) as [Pen, Pen];
  }

  free(): void {
    this.events?.free();
    this.world.free();
  }

  private penIndex(handle: number): number {
    return this.colliders.findIndex((c) => c.handle === handle);
  }

  private collectImpacts(queue: RapierNs.EventQueue): void {
    queue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      if (this.penIndex(h1) < 0 || this.penIndex(h2) < 0) return;
      const a = this.bodies[0].linvel();
      const b = this.bodies[1].linvel();
      const rel = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      this.impacts.push({ kind: 'pens', strength: clamp01(rel / 8) });
    });
    queue.drainContactForceEvents((e) => {
      const i1 = this.penIndex(e.collider1());
      const i2 = this.penIndex(e.collider2());
      // Pen-on-pen contact is already voiced by the collision start above.
      if (i1 >= 0 && i2 >= 0) return;
      const pen = (i1 >= 0 ? i1 : i2) as PlayerId;
      const strength = clamp01(e.totalForceMagnitude() / (massOf(this.models[pen]) * 1500));
      this.impacts.push({ kind: 'desk', strength, pen });
    });
  }
}
