import type { PenModelId } from './pens';
import type { PowerId } from './powers';
import type { Flick, Pen, PlayerId, Vec } from './types';

// Desk-plane geometry shared by input, rendering and the Rapier world.

export const DESK = { width: 800, height: 500 };
export const PEN_LENGTH = 150;
export const PEN_RADIUS = 6;
/** Half the pen's thickness; its centre rests this high above the desk. */
export const PEN_HALF_HEIGHT = 6;
/** Usable half-length along the axis for flicks. */
export const HALF_SEG = PEN_LENGTH / 2 - PEN_RADIUS;
export const MAX_IMPULSE = 1200;
/** How far below the desk top a falling pen fades out completely. */
export const FALL_DEPTH = 150;

const DRAG_TO_IMPULSE = 6;
const GRAB_SLOP = 20;

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Quaternion for a pen lying flat with its tip at desk heading `angle`.
 * The desk's y (down the screen) is the 3D world's z, so heading θ is a
 * rotation of -θ about the vertical axis.
 */
export function flatRotation(angle: number): [number, number, number, number] {
  return [0, Math.sin(-angle / 2), 0, Math.cos(-angle / 2)];
}

export function createPen(
  id: PlayerId,
  x: number,
  y: number,
  angle: number,
  model: PenModelId = 'click-red',
  power: PowerId | null = null,
): Pen {
  return { id, model, power, x, y, angle, h: PEN_HALF_HEIGHT, q: flatRotation(angle), out: false };
}

export function axis(pen: Pen): Vec {
  return { x: Math.cos(pen.angle), y: Math.sin(pen.angle) };
}

export function segment(pen: Pen): [Vec, Vec] {
  const d = scale(axis(pen), HALF_SEG);
  const c = { x: pen.x, y: pen.y };
  return [sub(c, d), add(c, d)];
}

/** Desk position of a point `along` the pen's axis. */
export function pointOnPen(pen: Pen, along: number): Vec {
  const d = axis(pen);
  return { x: pen.x + d.x * along, y: pen.y + d.y * along };
}

/** True when `point` is close enough to the pen to grab it. */
export function hitTest(pen: Pen, point: Vec): boolean {
  const [a, b] = segment(pen);
  const ab = sub(b, a);
  const t = clamp(dot(sub(point, a), ab) / dot(ab, ab), 0, 1);
  const q = add(a, scale(ab, t));
  return Math.hypot(point.x - q.x, point.y - q.y) <= PEN_RADIUS + GRAB_SLOP;
}

/** Turns a pull-back drag (press point to current pointer) into a flick. */
export function flickFromDrag(pen: Pen, press: Vec, current: Vec): Flick {
  const along = clamp(dot(sub(press, pen), axis(pen)), -HALF_SEG, HALF_SEG);
  let j = scale(sub(press, current), DRAG_TO_IMPULSE);
  const mag = Math.hypot(j.x, j.y);
  if (mag > MAX_IMPULSE) j = scale(j, MAX_IMPULSE / mag);
  return { along, ix: j.x, iy: j.y };
}

export function edgeDistance(pen: Pen): number {
  return Math.min(pen.x, DESK.width - pen.x, pen.y, DESK.height - pen.y);
}

/**
 * A pen's pose part way (`t` 0..1) between two physics steps, so drawing at
 * the screen's refresh rate doesn't show the fixed 60 Hz steps as judder.
 */
export function interpolatePen(a: Pen, b: Pen, t: number): Pen {
  if (t >= 1 || a.out !== b.out) return b;
  const [ax, ay, az, aw] = a.q;
  let [bx, by, bz, bw] = b.q;
  // Take the short way round.
  if (ax * bx + ay * by + az * bz + aw * bw < 0) [bx, by, bz, bw] = [-bx, -by, -bz, -bw];
  const q: [number, number, number, number] = [ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t, aw + (bw - aw) * t];
  const n = Math.hypot(...q) || 1;
  const da = Math.atan2(Math.sin(b.angle - a.angle), Math.cos(b.angle - a.angle));
  return {
    ...b,
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    h: a.h + (b.h - a.h) * t,
    angle: a.angle + da * t,
    q: [q[0] / n, q[1] / n, q[2] / n, q[3] / n],
  };
}
