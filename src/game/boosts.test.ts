import { beforeAll, describe, expect, it } from 'vitest';
import { createPen } from './physics';
import { PLAIN_SHOT, armBoost, boostProblem, disarmBoost, newMatch, nextRound, resolveShot, shotMods, type ShotMods } from './rules';
import type { GameState, Pen } from './types';
import { DeskWorld, initPhysics } from './world';

beforeAll(initPhysics);

const knockedOff = (s: GameState, p: 0 | 1): GameState => {
  const pens: [Pen, Pen] = [...s.pens];
  pens[p] = { ...pens[p], out: true, h: -200 };
  return { ...s, pens };
};

describe('super power rules', () => {
  it('arms one power for your own shot, and takes it back before the flick', () => {
    let s = newMatch();
    s = armBoost(s, 0, 'strike');
    expect(shotMods(s, 0).strike).toBeGreaterThan(1);
    expect(boostProblem(s, 0, 'lightning')).toMatch(/One super power a shot/);
    expect(boostProblem(s, 0, 'wall')).toMatch(/other player's shot/);
    s = disarmBoost(s, 0);
    expect(s.armed).toEqual([]);
    expect(shotMods(s, 0)).toEqual(PLAIN_SHOT);
  });

  it('lets the other player defend against the shot while it is aimed', () => {
    let s = newMatch();
    expect(boostProblem(s, 1, 'strike')).toMatch(/your own shot/);
    s = armBoost(s, 0, 'strike');
    s = armBoost(s, 1, 'wall');
    expect(s.defenseThisTurn).toBe('wall');
    expect(shotMods(s, 0)).toMatchObject({ strike: 1.5, wall: 1 });
    expect(boostProblem(s, 1, 'ice')).toMatch(/One super power a shot/);
    s = resolveShot(s, 0);
    expect(s.armed).toEqual([]);
    expect(s.defenseThisTurn).toBeNull();

    // Now player 2 shoots; player 1 tips the desk and freezes it… one at a time.
    s = armBoost(s, 0, 'tilt');
    expect(shotMods(s, 1).tilt).toBeLessThan(0);
    s = disarmBoost(s, 0);
    s = armBoost(s, 0, 'ice');
    expect(shotMods(s, 1)).toMatchObject({ ice: true, tilt: 0 });
  });

  it('lets Double Turn shoot again', () => {
    const s = resolveShot(armBoost(newMatch(), 0, 'double'), 0);
    expect(s.turn).toBe(0);
    expect(s.boostThisTurn).toBeNull();
  });

  it('puts a pen with a spare life back on the desk once', () => {
    let s = armBoost(newMatch(), 1, 'health');
    expect(s.lives[1]).toBe(1);
    s = resolveShot(knockedOff(s, 1), 0);
    expect(s.phase).toBe('aim');
    expect(s.pens[1].out).toBe(false);
    expect(s.saved).toEqual([1]);
    expect(s.lives[1]).toBe(0);
    // A second fall counts.
    s = resolveShot(knockedOff(s, 1), 1);
    expect(s.phase).toBe('roundOver');
    expect(s.roundWinner).toBe(0);
    expect(nextRound(s).lives).toEqual([0, 0]);
  });
});

describe('super power physics', () => {
  // The shooter at the middle, the other pen near the high-x end of the desk.
  const run = (mods: ShotMods, flickX: number) => {
    const world = new DeskWorld([createPen(0, 530, 250, Math.PI / 2), createPen(1, 700, 250, Math.PI / 2)]);
    world.setMods(mods, 0);
    world.flick(0, { along: 0, ix: flickX, iy: 0 });
    world.settle();
    const pens = world.read();
    world.free();
    return pens;
  };

  it('knocks the pen off with Power Strike or lightning where a plain flick doesn’t', () => {
    expect(run(PLAIN_SHOT, 700)[1].out).toBe(false);
    expect(run({ ...PLAIN_SHOT, strike: 1.5 }, 700)[1].out).toBe(true);
    expect(run({ ...PLAIN_SHOT, lightning: true }, 700)[1].out).toBe(true);
  });

  it('slides further on ice, and less with a gripping pen', () => {
    const plain = run(PLAIN_SHOT, 350);
    expect(run({ ...PLAIN_SHOT, ice: true }, 350)[0].x).toBeGreaterThan(plain[0].x + 50);
    expect(run({ ...PLAIN_SHOT, grip: 1 }, 700)[1].x).toBeLessThan(run(PLAIN_SHOT, 700)[1].x);
  });

  it('keeps a pen on the desk behind a Force Wall', () => {
    // Lightning knocks the pen off, unless the wall stops it.
    expect(run({ ...PLAIN_SHOT, lightning: true }, 700)[1].out).toBe(true);
    expect(run({ ...PLAIN_SHOT, lightning: true, wall: 0 }, 700)[1].out).toBe(false);
  });

  it('tips pens downhill on an Uneven Desk', () => {
    const flat = run(PLAIN_SHOT, 350);
    expect(run({ ...PLAIN_SHOT, tilt: 0.12 }, 350)[0].x).toBeGreaterThan(flat[0].x + 10);
  });
});
