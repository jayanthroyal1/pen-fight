import { describe, expect, it } from 'vitest';
import { createPen, flickFromDrag, hitTest } from './physics';

describe('flickFromDrag', () => {
  it('flicks away from the pull direction', () => {
    const pen = createPen(0, 200, 200, Math.PI / 2);
    const flick = flickFromDrag(pen, { x: 200, y: 200 }, { x: 150, y: 200 });
    expect(flick.ix).toBeGreaterThan(0);
    expect(flick.iy).toBeCloseTo(0);
    expect(flick.along).toBeCloseTo(0);
  });
});

describe('hitTest', () => {
  it('grabs a pen near its body but not far away', () => {
    const pen = createPen(0, 200, 200, 0);
    expect(hitTest(pen, { x: 250, y: 210 })).toBe(true);
    expect(hitTest(pen, { x: 200, y: 260 })).toBe(false);
  });
});
