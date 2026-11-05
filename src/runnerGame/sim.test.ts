import { describe, expect, it } from 'vitest';
import { MAX_SPEED, START_SPEED, WOLF_X, jump, newRun, release, score, step, viewWidth, type Obstacle, type Run } from './sim';

const DT = 1 / 120;
const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const running = (): Run => ({ ...newRun(), phase: 'running', gap: 1e9 });
const rock = (x: number): Obstacle => ({ kind: 'rock', x, w: 32, h: 34, lift: 0 });

describe('jumping', () => {
  it('jumps twice at most before landing, and lands', () => {
    const r = running();
    expect(jump(r)).toBe(true);
    expect(jump(r)).toBe(true);
    expect(jump(r)).toBe(false);
    let landed = false;
    for (let i = 0; i < 300 && !landed; i++) landed = step(r, DT, 520);
    expect(landed).toBe(true);
    expect(r.y).toBe(0);
    expect(jump(r)).toBe(true);
  });

  it('hops lower when the player lets go early', () => {
    const peak = (cut: boolean) => {
      const r = running();
      jump(r);
      let top = 0;
      for (let i = 0; i < 200; i++) {
        if (cut && i === 6) release(r);
        step(r, DT, 520);
        top = Math.max(top, r.y);
      }
      return top;
    };
    expect(peak(true)).toBeLessThan(peak(false) * 0.6);
  });
});

describe('obstacles', () => {
  it('ends the run on a hit, and only then', () => {
    const r = running();
    r.obstacles = [rock(WOLF_X + 60)];
    for (let i = 0; i < 120; i++) step(r, DT, 520);
    expect(r.phase).toBe('over');

    const clear = running();
    clear.obstacles = [rock(WOLF_X + 90)];
    jump(clear);
    for (let i = 0; i < 120; i++) step(clear, DT, 520);
    expect(clear.phase).toBe('running');
  });

  it('lets the wolf run under an owl, but not jump into it', () => {
    const owl = (): Obstacle => ({ kind: 'owl', x: WOLF_X + 120, w: 42, h: 28, lift: 58 });
    const under = running();
    under.obstacles = [owl()];
    for (let i = 0; i < 120; i++) step(under, DT, 520);
    expect(under.phase).toBe('running');

    const into = running();
    into.obstacles = [owl()];
    for (let i = 0; i < 30; i++) step(into, DT, 520);
    jump(into);
    for (let i = 0; i < 90; i++) step(into, DT, 520);
    expect(into.phase).toBe('over');
  });

  it('speeds up, but never past the limit', () => {
    const r = running();
    expect(r.speed).toBe(START_SPEED);
    r.distance = 1e7;
    step(r, DT, 520);
    expect(r.speed).toBe(MAX_SPEED);
  });
});

describe('fairness', () => {
  /** A steady player: jumps in good time for what's on the ground, and stays down for owls. */
  function bot(seed: number, viewW: number, seconds: number): number {
    const rng = seeded(seed);
    const r = running();
    r.gap = 260;
    for (let i = 0; i < seconds / DT && r.phase === 'running'; i++) {
      const next = r.obstacles.find((o) => o.x + o.w > WOLF_X);
      const lead = r.speed * 0.2;
      if (next && next.lift === 0 && r.y === 0 && next.x - (WOLF_X + 40) < lead) jump(r);
      step(r, DT, viewW, rng);
    }
    return score(r);
  }

  it('can always be survived, at full speed, on tall and wide screens', () => {
    for (const viewW of [520, 900]) {
      for (const seed of [3, 11, 29, 47, 83]) {
        const points = bot(seed, viewW, 120);
        // Two minutes at this pace, without one forced crash.
        expect(points, `seed ${seed} view ${viewW}`).toBeGreaterThan(4000);
      }
    }
  });

  it('shows enough ahead on any screen shape', () => {
    expect(viewWidth(375, 812)).toBe(520);
    expect(viewWidth(812, 375)).toBeCloseTo(736, 0);
    expect(viewWidth(2560, 800)).toBe(1000);
  });
});
