import { describe, expect, it } from 'vitest';
import { easeFlick, flickFromPull, pullPower, type Drag } from './aiming';
import { MAX_IMPULSE } from './physics';

const drag = (screenPull: number, deskPull: { x: number; y: number }): Drag => ({
  along: 10,
  pressDesk: { x: 200, y: 200 },
  currentDesk: { x: 200 - deskPull.x, y: 200 - deskPull.y },
  pressScreen: { x: 100, y: 100 },
  currentScreen: { x: 100, y: 100 + screenPull },
});

describe('flickFromPull', () => {
  it('aims away from the pull on the desk', () => {
    const f = flickFromPull(drag(60, { x: 30, y: 0 }), 120);
    expect(f.ix).toBeGreaterThan(0);
    expect(f.iy).toBeCloseTo(0);
    expect(f.along).toBe(10);
  });

  it('takes its power from the pull on screen, capped at full power', () => {
    const half = flickFromPull(drag(60, { x: 5, y: 5 }), 120);
    expect(Math.hypot(half.ix, half.iy)).toBeCloseTo(MAX_IMPULSE / 2);
    expect(pullPower(drag(500, { x: 5, y: 0 }), 120)).toBe(1);
  });
});

describe('easeFlick', () => {
  it('swings the aim round rather than shrinking it', () => {
    const shown = { along: 0, ix: 100, iy: 0 };
    const target = { along: 0, ix: -100, iy: 1 };
    const mid = easeFlick(shown, target, 0.5);
    expect(Math.hypot(mid.ix, mid.iy)).toBeCloseTo(100);
  });
});
