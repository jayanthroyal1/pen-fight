/**
 * The geometry of a blade: where it is, and whether it crossed a body. This is
 * pure maths, so a fast swing can't tunnel through a target between two steps
 * and the physics engine never decides who got hit.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface Capsule {
  a: V3;
  b: V3;
  radius: number;
}

export interface Blade {
  root: V3;
  tip: V3;
}

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const lerp = (a: V3, b: V3, t: number): V3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const length = (a: V3) => Math.sqrt(dot(a, a));

/** The closest two segments come to each other. */
export function segmentDistance(p1: V3, q1: V3, p2: V3, q2: V3): number {
  const d1 = sub(q1, p1);
  const d2 = sub(q2, p2);
  const r = sub(p1, p2);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s = 0;
  let t = 0;
  if (a <= 1e-9 && e <= 1e-9) return length(r);
  if (a <= 1e-9) t = clamp01(f / e);
  else {
    const c = dot(d1, r);
    if (e <= 1e-9) s = clamp01(-c / a);
    else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > 1e-9 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  return length(sub(lerp(p1, q1, s), lerp(p2, q2, t)));
}

/** How far apart each sample of a swept blade may be, in metres. */
const SWEEP_STEP = 0.1;

/** Did a blade touch this body at any point moving from `before` to `after`? */
export function sweepHits(before: Blade, after: Blade, bladeRadius: number, body: Capsule): boolean {
  const travel = Math.max(length(sub(after.tip, before.tip)), length(sub(after.root, before.root)));
  const samples = Math.max(1, Math.ceil(travel / SWEEP_STEP));
  const reach = bladeRadius + body.radius;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    if (segmentDistance(lerp(before.root, after.root, t), lerp(before.tip, after.tip, t), body.a, body.b) <= reach) return true;
  }
  return false;
}

/** Are two blades close enough to meet? */
export const bladesMeet = (a: Blade, b: Blade, tolerance: number) => segmentDistance(a.root, a.tip, b.root, b.tip) <= tolerance;
