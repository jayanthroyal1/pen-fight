import { describe, expect, it } from 'vitest';
import { newMatch } from '../game/rules';
import { rateShot } from './highlights';
import { replayPose } from './replay';
import type { PenPose, ShotRecord } from './types';

const pose = (x: number): PenPose => ({ x, y: 250, h: 6, q: [0, 0, 0, 1], out: false });

const shot: ShotRecord = {
  index: 0,
  round: 1,
  shooter: 0,
  model: 'click-red',
  flick: { along: 0, ix: 500, iy: 0 },
  at: '',
  before: [pose(500), pose(200)],
  after: [pose(300), pose(200)],
  frames: [
    { t: 50, pens: [pose(450), pose(200)] },
    { t: 100, pens: [pose(400), pose(200)] },
  ],
  impacts: [],
  outcome: { roundWinner: null, reason: null, scores: [0, 0] },
};

describe('replayPose', () => {
  const state = newMatch();
  const h = rateShot(shot);

  it('holds the starting position for a moment, then plays the shot', () => {
    expect(replayPose(h, state, 0)![0].x).toBe(500);
    // 500 ms lead-in, then 25 ms into the shot: halfway to the first frame.
    expect(replayPose(h, state, 525)![0].x).toBeCloseTo(475);
    expect(replayPose(h, state, 575)![0].x).toBeCloseTo(425);
  });

  it('ends on where the pens came to rest, then stops', () => {
    expect(replayPose(h, state, 500 + 150 + 100)![0].x).toBeCloseTo(300);
    expect(replayPose(h, state, 500 + 150 + 2000)).toBeNull();
  });

  it('keeps each player’s pen and power', () => {
    const pens = replayPose(h, state, 600)!;
    expect(pens[0].model).toBe(state.loadouts[0].model);
    expect(pens[1].id).toBe(1);
  });
});
