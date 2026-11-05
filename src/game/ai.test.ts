import { beforeAll, describe, expect, it } from 'vitest';
import { chooseAiShot, chooseAiShotSoon } from './ai';
import { DESK, createPen } from './physics';
import { newMatch } from './rules';
import type { GameState } from './types';
import { DeskWorld, initPhysics } from './world';

beforeAll(initPhysics);

/** Small seeded generator so the test is repeatable. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('chooseAiShot', () => {
  it('knocks off an opponent sitting at the desk edge', () => {
    const state: GameState = {
      ...newMatch(),
      turn: 1,
      pens: [
        createPen(0, DESK.width / 2 - 40, DESK.height - 25, 0),
        createPen(1, DESK.width / 2, DESK.height / 2, 0),
      ],
    };
    const flick = chooseAiShot(state, 1, { rng: mulberry32(7), wobble: 0 });
    const world = new DeskWorld(state.pens);
    world.flick(1, flick);
    world.settle();
    const pens = world.read();
    world.free();
    expect(pens[0].out).toBe(true);
    expect(pens[1].out).toBe(false);
  });
});

describe('thinking without freezing the game', () => {
  it('gives the same shot in slices as in one go, and can be stopped', async () => {
    const state = newMatch();
    const whole = chooseAiShot(state, 0, { rng: mulberry32(9), samples: 20, wobble: 0 });
    const sliced = await chooseAiShotSoon(state, 0, { rng: mulberry32(9), samples: 20, wobble: 0 }, () => false);
    expect(sliced).toEqual(whole);
    expect(await chooseAiShotSoon(state, 0, { samples: 20 }, () => true)).toBeNull();
  });
});
