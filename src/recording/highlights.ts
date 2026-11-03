import type { PlayerId } from '../game/types';
import type { MatchRecord, ShotRecord } from './types';

/** Why a shot made the highlights. */
export type ShotKind = 'knockout' | 'big-hit' | 'long-slide';

export interface Highlight {
  shot: ShotRecord;
  kind: ShotKind;
  score: number;
}

/** A pen-on-pen hit at least this hard counts as a big hit. */
const BIG_HIT = 0.55;

/** How far (desk px) the shooter's pen travelled during the shot. */
function travel(shot: ShotRecord): number {
  const id = shot.shooter;
  let dist = 0;
  let prev = shot.before[id];
  for (const f of shot.frames) {
    const p = f.pens[id];
    if (!p.out) dist += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return dist;
}

/**
 * How good a shot was: knocking the other pen off counts most, then how
 * hard the pens hit, then how far the shooter's pen went. Zero for a shot
 * that only sent the shooter off the desk.
 */
export function rateShot(shot: ShotRecord): Highlight {
  const hardest = Math.max(0, ...shot.impacts.filter((i) => i.kind === 'pens').map((i) => i.strength ?? 0));
  const knocked = shot.outcome?.roundWinner === shot.shooter && shot.outcome.reason === 'knocked';
  const fell = shot.after?.[shot.shooter].out ?? false;
  const dist = travel(shot);
  const score = fell && !knocked ? 0 : (knocked ? 100 : 0) + hardest * 40 + Math.min(dist, 600) / 30;
  const kind: ShotKind = knocked ? 'knockout' : hardest >= BIG_HIT ? 'big-hit' : 'long-slide';
  return { shot, kind, score };
}

/** A player's best shots in a match, best first; only shots worth showing. */
export function bestShots(record: MatchRecord, player: PlayerId, count = 2): Highlight[] {
  return record.shots
    .filter((s) => s.shooter === player && s.after && s.frames.length > 1)
    .map(rateShot)
    .filter((h) => h.score >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

/** True when this shot beats every earlier shot by the same player and is worth calling out. */
export function isNewBest(record: MatchRecord, shot: ShotRecord): boolean {
  const score = rateShot(shot).score;
  if (score < 40) return false;
  return record.shots
    .filter((s) => s !== shot && s.shooter === shot.shooter && s.index < shot.index && s.after)
    .every((s) => rateShot(s).score < score);
}

export const SHOT_LABELS: Record<ShotKind, string> = {
  knockout: 'Knock-off!',
  'big-hit': 'Big hit',
  'long-slide': 'Long slide',
};
