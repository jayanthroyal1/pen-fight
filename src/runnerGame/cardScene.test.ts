import { describe, expect, it } from 'vitest';
import { LAP, autoStep, freshRun } from './cardScene';
import { WOLF_H } from './sim';

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('the card’s wolf', () => {
  it('runs a whole lap without crashing, and stays in the card’s small sky', () => {
    for (const seed of [2, 7, 19, 41, 73]) {
      const rng = seeded(seed);
      const r = freshRun();
      let top = 0;
      while (r.distance < LAP && r.phase === 'running') {
        autoStep(r, null, rng);
        top = Math.max(top, r.y + WOLF_H);
      }
      expect(r.phase, `seed ${seed} at ${Math.round(r.distance)}`).toBe('running');
      expect(top).toBeLessThan(130);
    }
  });
});
