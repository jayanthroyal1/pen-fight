import { describe, expect, it } from 'vitest';
import { bestShots, isNewBest, rateShot } from './highlights';
import type { MatchRecord, PenPose, ShotRecord } from './types';

const pose = (x: number, out = false): PenPose => ({ x, y: 250, h: 6, q: [0, 0, 0, 1], out });

function shot(index: number, shooter: 0 | 1, opts: { hit?: number; knocked?: boolean; fell?: boolean; slide?: number }): ShotRecord {
  const start = shooter === 0 ? 576 : 224;
  const end = start - (opts.slide ?? 100);
  return {
    index,
    round: 1,
    shooter,
    model: 'click-red',
    flick: { along: 0, ix: 500, iy: 0 },
    at: '',
    before: [pose(576), pose(224)],
    after: shooter === 0 ? [pose(end, !!opts.fell), pose(224, !!opts.knocked)] : [pose(576, !!opts.knocked), pose(end, !!opts.fell)],
    frames: [
      { t: 50, pens: [pose(576), pose(224)] },
      { t: 100, pens: shooter === 0 ? [pose(end), pose(224)] : [pose(576), pose(end)] },
    ],
    impacts: opts.hit ? [{ t: 60, kind: 'pens', strength: opts.hit }] : [],
    outcome: opts.knocked
      ? { roundWinner: shooter, reason: 'knocked', scores: [1, 0] }
      : opts.fell
        ? { roundWinner: shooter === 0 ? 1 : 0, reason: 'fell', scores: [0, 1] }
        : { roundWinner: null, reason: null, scores: [0, 0] },
  };
}

const record = (shots: ShotRecord[]): MatchRecord => ({
  id: 'm',
  version: 1,
  mode: 'ai',
  startedAt: '',
  updatedAt: '',
  endedAt: null,
  players: [
    { name: 'A', model: 'click-red' },
    { name: 'B', model: 'gripper' },
  ],
  me: 0,
  shots,
  winner: null,
  scores: [0, 0],
});

describe('rateShot', () => {
  it('rates a knock-off above a big hit, and a big hit above a gentle slide', () => {
    const ko = rateShot(shot(0, 0, { hit: 0.4, knocked: true }));
    const big = rateShot(shot(1, 0, { hit: 0.9 }));
    const slide = rateShot(shot(2, 0, { slide: 120 }));
    expect(ko.kind).toBe('knockout');
    expect(big.kind).toBe('big-hit');
    expect(ko.score).toBeGreaterThan(big.score);
    expect(big.score).toBeGreaterThan(slide.score);
  });

  it('gives nothing for sliding yourself off the desk', () => {
    expect(rateShot(shot(0, 0, { fell: true, slide: 400 })).score).toBe(0);
  });
});

describe('bestShots', () => {
  it("picks the player's own top shots, best first", () => {
    const r = record([shot(0, 0, { hit: 0.3 }), shot(1, 1, { knocked: true }), shot(2, 0, { hit: 0.9 }), shot(3, 0, { knocked: true })]);
    const best = bestShots(r, 0);
    expect(best.map((h) => h.shot.index)).toEqual([3, 2]);
  });
});

describe('isNewBest', () => {
  it('calls out a shot that beats the player’s earlier ones', () => {
    const s0 = shot(0, 0, { hit: 0.5 });
    const s1 = shot(1, 0, { knocked: true });
    const s2 = shot(2, 0, { hit: 0.6 });
    const r = record([s0, s1, s2]);
    expect(isNewBest(r, s1)).toBe(true);
    expect(isNewBest(r, s2)).toBe(false);
  });
});
