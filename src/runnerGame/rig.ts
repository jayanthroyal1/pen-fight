import { START_SPEED, type Run } from './sim';

/**
 * How the wolf moves, for the eye only: nothing here changes the game. A gallop
 * with real leg joints, springs that make the body squash, pitch and settle, a
 * tail that swings on its own, dust, and a tumble when it crashes. Distances are
 * in world units, with x forward and y up from the ground under the wolf.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Leg {
  hip: Pt;
  knee: Pt;
  foot: Pt;
  far: boolean;
  front: boolean;
}

export interface Dust {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
}

export interface Pose {
  /** Top of the rump and of the shoulders, and the head. */
  hip: Pt;
  chest: Pt;
  head: Pt;
  headTilt: number;
  legs: Leg[];
  tail: Pt[];
  /** Whole-body lean and stretch. */
  pitch: number;
  squash: number;
  /** Lifted off the ground by a jump, or thrown by a crash. */
  x: number;
  y: number;
  rotation: number;
  earFlick: number;
}

const TAU = Math.PI * 2;
/** Ground covered in one full gallop stride. */
const STRIDE = 150;
const REACH = 15;
const LIFT = 10;
const HIND_X = -20;
const FRONT_X = 16;
const THIGH = 14;
const SHIN = 15;
const TAIL_LINKS = 6;
const TAIL_LINK = 7;
const MAX_DUST = 60;
const GRAVITY = 2300;

/**
 * Where the middle joint of a two-bone limb goes, to reach from `from` to `to`.
 * `bend` picks the side: +1 forward, like a hind knee; -1 back, like a front elbow.
 */
export function solveKnee(from: Pt, to: Pt, upper: number, lower: number, bend: 1 | -1): Pt {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.min(Math.hypot(dx, dy) || 0.001, upper + lower - 0.01);
  const along = (upper * upper - lower * lower + d * d) / (2 * d);
  const out = Math.sqrt(Math.max(0, upper * upper - along * along));
  const ux = dx / (Math.hypot(dx, dy) || 1);
  const uy = dy / (Math.hypot(dx, dy) || 1);
  return { x: from.x + ux * along - uy * out * bend, y: from.y + uy * along + ux * out * bend };
}

/** One step of a damped spring pulling `value` to `target`. */
function spring(s: { v: number; x: number }, target: number, stiffness: number, damping: number, dt: number): void {
  s.v += ((target - s.x) * stiffness - s.v * damping) * dt;
  s.x += s.v * dt;
}

/** A foot's path through one stride: back along the ground, then lifted forward. */
function footPath(phase: number): Pt {
  const p = ((phase % 1) + 1) % 1;
  if (p < 0.5) return { x: REACH * (1 - 4 * p), y: 0 };
  const t = (p - 0.5) * 2;
  return { x: -REACH + 2 * REACH * t, y: Math.sin(Math.PI * t) * LIFT };
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export class WolfRig {
  private gait = 0;
  private air = 0;
  private moving = 0;
  private pitch = { x: 0, v: 0 };
  private squash = { x: 0, v: 0 };
  private ear = { x: 0, v: 0 };
  private tail: Pt[] = [];
  private tailBefore: Pt[] = [];
  private kick = 0;
  private time = 0;
  private wasOver = false;
  private rising = true;
  /** How far the wolf has collapsed after a crash, 0 to 1. */
  private slump = 0;
  dust: Dust[] = [];
  crash: { x: number; y: number; vx: number; vy: number; rot: number; spin: number; resting: boolean } | null = null;
  /** Screen shake still to come, in world units. */
  shake = 0;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.crash = null;
    this.wasOver = false;
    this.slump = 0;
    this.dust = [];
    this.shake = 0;
    this.tail = Array.from({ length: TAIL_LINKS }, (_, i) => ({ x: -30 - i * TAIL_LINK, y: 26 - i * 3 }));
    this.tailBefore = this.tail.map((p) => ({ ...p }));
  }

  /** The wolf left the ground. */
  jumped(): void {
    this.squash.v += 3.2;
    this.ear.v -= 6;
    this.puff(-14, 8, 70);
  }

  private puff(x: number, count: number, speed: number): void {
    for (let i = 0; i < count && this.dust.length < MAX_DUST; i++) {
      this.dust.push({
        x: x + (Math.random() - 0.5) * 14,
        y: 2,
        vx: (Math.random() - 0.7) * speed,
        vy: 20 + Math.random() * speed * 0.8,
        age: 0,
        life: 0.3 + Math.random() * 0.3,
        size: 3 + Math.random() * 5,
      });
    }
  }

  update(dt: number, r: Run, landed: boolean): void {
    this.time += dt;
    const running = r.phase === 'running';
    this.moving += ((running ? 1 : 0) - this.moving) * Math.min(1, dt * 8);
    if (running) this.gait += (r.speed * dt) / STRIDE;
    this.air += ((r.y > 0 ? 1 : 0) - this.air) * Math.min(1, dt * 16);
    this.rising = r.vy > 0;

    if (landed) {
      this.squash.v -= 4.4;
      this.ear.v += 7;
      this.shake = Math.max(this.shake, 1.5);
      this.puff(0, 10, 110);
    }
    spring(this.pitch, Math.max(-0.34, Math.min(0.34, r.vy / 2000)), 110, 15, dt);
    spring(this.squash, 0, 240, 15, dt);
    spring(this.ear, running ? -0.1 + Math.sin(this.gait * TAU) * 0.08 : 0, 120, 10, dt);

    // Dust kicked up by the hind feet at speed.
    this.kick -= dt;
    if (running && r.y === 0 && this.kick <= 0) {
      this.kick = Math.max(0.05, 0.14 - (r.speed - START_SPEED) / 5000);
      this.puff(-24, 1, 60);
    }

    this.stepTail(dt, r);
    this.stepCrash(dt, r);

    const flow = running ? r.speed : 0;
    this.dust = this.dust.filter((d) => {
      d.age += dt;
      d.vy -= 60 * dt;
      d.x += (d.vx - flow * 0.9) * dt;
      d.y = Math.max(1, d.y + d.vy * dt);
      return d.age < d.life;
    });
    this.shake *= Math.exp(-dt * 12);
  }

  /** The tail: links with momentum, pushed back by the wind of running. */
  private stepTail(dt: number, r: Run): void {
    const root = { x: -30, y: 27 + r.y + Math.sin(this.gait * TAU) * 2 };
    const wind = this.moving * (500 + r.speed * 1.3);
    const lift = 240 * this.moving;
    const wag = this.moving < 0.5 ? Math.sin(this.time * 7) * 260 : 0;
    this.tail.forEach((p, i) => {
      if (i === 0) return;
      const before = this.tailBefore[i];
      const vx = (p.x - before.x) * 0.92;
      const vy = (p.y - before.y) * 0.92;
      before.x = p.x;
      before.y = p.y;
      p.x += vx + (-wind + wag * (i / TAIL_LINKS)) * dt * dt;
      p.y += vy + (lift - 620) * dt * dt;
    });
    this.tail[0] = root;
    this.tailBefore[0] = { ...root };
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < this.tail.length; i++) {
        const a = this.tail[i - 1];
        const b = this.tail[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        b.x = a.x + (dx / d) * TAIL_LINK;
        b.y = a.y + (dy / d) * TAIL_LINK;
      }
    }
  }

  /** A crash throws the wolf: it flips, bounces, slides and comes to rest. */
  private stepCrash(dt: number, r: Run): void {
    if (r.phase === 'over' && !this.wasOver) {
      this.wasOver = true;
      this.crash = { x: 0, y: r.y, vx: -r.speed * 0.32, vy: 330 + r.speed * 0.25, rot: 0, spin: -8 - r.speed / 120, resting: false };
      this.shake = 7;
      this.puff(26, 18, 170);
    }
    const c = this.crash;
    if (!c) return;
    if (c.resting) {
      // It rolls upright and sinks down, belly on the ground.
      const upright = Math.round(c.rot / TAU) * TAU;
      c.rot += (upright - c.rot) * Math.min(1, dt * 10);
      if (Math.abs(upright - c.rot) < 0.001) c.rot = upright;
      this.slump += (1 - this.slump) * Math.min(1, dt * 9);
      return;
    }
    c.vy -= GRAVITY * dt;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.rot += c.spin * dt;
    if (c.y <= 0) {
      c.y = 0;
      if (Math.abs(c.vy) > 80) this.puff(c.x, 6, 90);
      c.vy = -c.vy * 0.34;
      c.vx *= 0.55;
      c.spin *= 0.45;
      if (Math.abs(c.vy) < 60) {
        c.vy = 0;
        c.vx = 0;
        c.spin = 0;
        c.resting = true;
      }
    }
  }

  pose(): Pose {
    const beat = this.gait * TAU;
    // The back flexes: the shoulders rise as the rump falls, then the other way.
    const flex = 2.6 * this.moving * (1 - this.air);
    const down = this.slump;
    const hip: Pt = { x: -22, y: 29 + Math.sin(beat) * flex - 11 * down };
    const chest: Pt = { x: 15, y: 30 + Math.sin(beat + Math.PI) * flex - 13 * down };
    const head: Pt = { x: 34 + 7 * down, y: 38 + Math.sin(beat + 0.9) * flex * 0.8 - 28 * down };

    const legs = (
      [
        { front: false, far: true, offset: 0.1 },
        { front: true, far: true, offset: 0.62 },
        { front: false, far: false, offset: 0 },
        { front: true, far: false, offset: 0.5 },
      ] as const
    ).map(({ front, far, offset }) => {
      const anchor = front ? { x: FRONT_X + 1, y: chest.y - 7 } : { x: HIND_X, y: hip.y - 6 };
      const home = front ? FRONT_X + 2 : HIND_X - 2;
      const path = footPath(this.gait + offset);
      const ground = { x: home + path.x * this.moving, y: path.y * this.moving };
      // In the air the legs reach and tuck: stretched out rising, gathered coming down.
      const stretch = front ? { x: home + 22, y: 15 } : { x: home - 22, y: 13 };
      const gather = front ? { x: home + 11, y: 6 } : { x: home + 5, y: 9 };
      const flight = this.rising ? stretch : gather;
      const foot = { x: mix(ground.x, flight.x, this.air), y: mix(ground.y, flight.y, this.air) };
      // Collapsed, the legs fold forward under the body.
      foot.x = mix(foot.x, home + (front ? 17 : 15), down);
      foot.y = mix(foot.y, 0, down);
      if (far) foot.x += 2;
      const knee = solveKnee(anchor, foot, THIGH, SHIN, front ? -1 : 1);
      return { hip: anchor, knee, foot, far, front };
    });

    const c = this.crash;
    return {
      hip,
      chest,
      head,
      headTilt: Math.sin(beat + 0.5) * 0.05 * this.moving,
      legs,
      tail: this.tail,
      pitch: this.pitch.x,
      squash: this.squash.x * 0.09,
      x: c?.x ?? 0,
      y: c?.y ?? 0,
      rotation: c?.rot ?? 0,
      earFlick: this.ear.x,
    };
  }
}
