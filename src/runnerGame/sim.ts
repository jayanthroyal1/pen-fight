/**
 * Wolf Run: the wolf runs by itself and the player only jumps. Everything is in
 * world units, with heights measured up from the ground, so the same rules run
 * on any screen; only how far ahead you can see (`viewW`) changes.
 */

export const WOLF_X = 70;
export const WOLF_W = 50;
export const WOLF_H = 38;
const GRAVITY = 2300;
const JUMP = 780;
/** The second jump, in mid-air, is a little weaker. */
const AIR_JUMP = 660;
/** Letting go early cuts a jump short, for small hops. */
const CUT = 280;
export const START_SPEED = 330;
export const MAX_SPEED = 760;
/** Speed gained per unit run. */
const RAMP = 0.0135;
/** Hitboxes are smaller than the drawings, so near misses feel lucky, not unfair. */
const FORGIVE = 6;
/** Distance per point. */
const PER_POINT = 10;
/** Where owls only start to appear, once the player has the hang of it. */
const OWLS_FROM = 1500;
const RIDGES_FROM = 800;
export const OWL_LIFT = 58;

export type ObstacleKind = 'rock' | 'boulder' | 'ridge' | 'owl';

export interface Obstacle {
  kind: ObstacleKind;
  x: number;
  w: number;
  h: number;
  /** Height of its underside above the ground. */
  lift: number;
}

export interface Run {
  phase: 'ready' | 'running' | 'over';
  distance: number;
  speed: number;
  /** Height of the wolf's feet above the ground. */
  y: number;
  vy: number;
  jumps: number;
  obstacles: Obstacle[];
  /** Distance until the next obstacle appears. */
  gap: number;
}

const SIZES: Record<ObstacleKind, { w: number; h: number; lift: number }> = {
  rock: { w: 32, h: 34, lift: 0 },
  boulder: { w: 36, h: 62, lift: 0 },
  ridge: { w: 74, h: 30, lift: 0 },
  owl: { w: 42, h: 28, lift: OWL_LIFT },
};

export const newRun = (): Run => ({
  phase: 'ready',
  distance: 0,
  speed: START_SPEED,
  y: 0,
  vy: 0,
  jumps: 0,
  obstacles: [],
  gap: 260,
});

export const score = (r: Run) => Math.floor(r.distance / PER_POINT);

/** Jumps if it can: from the ground, or once more in the air. */
export function jump(r: Run): boolean {
  if (r.phase !== 'running' || r.jumps >= 2) return false;
  r.vy = r.jumps === 0 ? JUMP : AIR_JUMP;
  r.jumps += 1;
  return true;
}

/** The player let go: a jump still rising fast stops rising so fast. */
export function release(r: Run): void {
  if (r.vy > CUT) r.vy = CUT;
}

function pick(distance: number, rng: () => number): ObstacleKind {
  const roll = rng();
  if (distance > OWLS_FROM && roll < 0.2) return 'owl';
  if (distance > RIDGES_FROM && roll < 0.42) return 'ridge';
  return roll < 0.72 ? 'rock' : 'boulder';
}

function overlaps(r: Run, o: Obstacle): boolean {
  const left = WOLF_X + FORGIVE;
  const right = WOLF_X + WOLF_W - FORGIVE;
  const feet = r.y + FORGIVE / 2;
  const head = r.y + WOLF_H - FORGIVE;
  return right > o.x + FORGIVE && left < o.x + o.w - FORGIVE && head > o.lift + 2 && feet < o.lift + o.h - FORGIVE;
}

/** Moves the run on by `dt` seconds. Returns true when the wolf has just landed. */
export function step(r: Run, dt: number, viewW: number, rng: () => number = Math.random): boolean {
  if (r.phase !== 'running') return false;
  r.speed = Math.min(MAX_SPEED, START_SPEED + r.distance * RAMP);
  const move = r.speed * dt;
  r.distance += move;

  for (const o of r.obstacles) o.x -= move;
  r.obstacles = r.obstacles.filter((o) => o.x + o.w > -20);

  r.gap -= move;
  if (r.gap <= 0) {
    const kind = pick(r.distance, rng);
    r.obstacles.push({ kind, x: viewW + 30, ...SIZES[kind] });
    // In time, not distance: faster running needs longer gaps to stay fair.
    r.gap = SIZES[kind].w + r.speed * (0.82 + rng() * 0.85);
  }

  let landed = false;
  if (r.y > 0 || r.vy > 0) {
    r.vy -= GRAVITY * dt;
    r.y += r.vy * dt;
    if (r.y <= 0) {
      r.y = 0;
      r.vy = 0;
      r.jumps = 0;
      landed = true;
    }
  }
  if (r.obstacles.some((o) => overlaps(r, o))) r.phase = 'over';
  return landed;
}

/** How wide a view of the world a screen gets: tall screens still see enough to react. */
export function viewWidth(w: number, h: number): number {
  if (w <= h) return 520;
  return Math.min(1000, Math.max(520, 340 * (w / h)));
}
