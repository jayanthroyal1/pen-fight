import { describe, expect, it } from 'vitest';
import { renderApplause } from './applause';

function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

const rms = (a: Float32Array, from: number, to: number) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += a[i] * a[i];
  return Math.sqrt(sum / (to - from));
};

describe('renderApplause', () => {
  const rate = 22050;
  const [left, right] = renderApplause(rate, { seconds: 3, clappers: 30, rng: seeded(42) });

  it('is loud but never clips', () => {
    let peak = 0;
    for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
    expect(peak).toBeCloseTo(0.9, 2);
    expect(rms(left, rate * 0.5, rate * 1.5)).toBeGreaterThan(0.05);
  });

  it('dies away as people stop clapping', () => {
    const middle = rms(left, rate * 0.5, rate * 1.5);
    const end = rms(left, Math.floor(rate * 3.1), left.length);
    expect(end).toBeLessThan(middle * 0.3);
  });

  it('spreads the crowd across both ears', () => {
    expect(rms(right, rate * 0.5, rate * 1.5)).toBeGreaterThan(0.02);
    let diff = 0;
    for (let i = rate; i < rate * 2; i++) diff += Math.abs(left[i] - right[i]);
    expect(diff).toBeGreaterThan(0);
  });
});
