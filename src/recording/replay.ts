import { interpolatePen } from '../game/physics';
import type { GameState, Loadout, Pen, PlayerId } from '../game/types';
import type { Highlight } from './highlights';
import type { PenPose } from './types';

/** Replays run at 60% speed, so a good shot can be enjoyed. */
export const REPLAY_SPEED = 0.6;

function poseToPen(p: PenPose, id: PlayerId, loadout: Loadout): Pen {
  const [qx, qy, qz, qw] = p.q;
  return {
    id,
    model: loadout.model,
    power: loadout.power,
    x: p.x,
    y: p.y,
    h: p.h,
    q: p.q,
    out: p.out,
    angle: Math.atan2(2 * (qx * qz - qw * qy), 1 - 2 * (qy * qy + qz * qz)),
  };
}

/**
 * Where both pens were `ms` into a recorded shot (with a moment to look at the
 * start and the end), or null once the replay is over.
 */
export function replayPose(h: Highlight, s: GameState, ms: number): [Pen, Pen] | null {
  const lead = 500;
  const frames = [{ t: 0, pens: h.shot.before }, ...h.shot.frames, ...(h.shot.after ? [{ t: (h.shot.frames.at(-1)?.t ?? 0) + 50, pens: h.shot.after }] : [])];
  const t = ms - lead;
  const endT = frames[frames.length - 1].t;
  if (t > endT + 900) return null;
  const clamped = Math.max(0, Math.min(endT, t));
  let i = 0;
  while (i < frames.length - 2 && frames[i + 1].t < clamped) i++;
  const a = frames[i];
  const b = frames[Math.min(i + 1, frames.length - 1)];
  const k = b.t > a.t ? (clamped - a.t) / (b.t - a.t) : 1;
  const pen = (id: PlayerId) => interpolatePen(poseToPen(a.pens[id], id, s.loadouts[id]), poseToPen(b.pens[id], id, s.loadouts[id]), k);
  return [pen(0), pen(1)];
}

