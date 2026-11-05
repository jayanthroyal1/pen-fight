import { describe, expect, it } from 'vitest';
import { WolfRig, solveKnee } from './rig';
import { newRun, type Run } from './sim';

const DT = 1 / 120;
const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const running = (): Run => ({ ...newRun(), phase: 'running' });

describe('the wolf’s joints', () => {
  it('keeps each bone its length, and bends the chosen way', () => {
    const hip = { x: 0, y: 30 };
    const foot = { x: 6, y: 6 };
    const forward = solveKnee(hip, foot, 14, 15, 1);
    const back = solveKnee(hip, foot, 14, 15, -1);
    expect(gap(hip, forward)).toBeCloseTo(14, 3);
    expect(gap(forward, foot)).toBeCloseTo(15, 3);
    expect(forward.x).toBeGreaterThan(back.x);
  });

  it('copes with a foot too far away to reach', () => {
    const knee = solveKnee({ x: 0, y: 0 }, { x: 100, y: 0 }, 14, 15, 1);
    expect(Number.isFinite(knee.x)).toBe(true);
    expect(gap({ x: 0, y: 0 }, knee)).toBeCloseTo(14, 1);
  });
});

describe('the gallop', () => {
  it('plants feet on the ground and never below it', () => {
    const rig = new WolfRig();
    const r = running();
    let planted = 0;
    for (let i = 0; i < 300; i++) {
      rig.update(DT, r, false);
      for (const leg of rig.pose().legs) {
        expect(leg.foot.y).toBeGreaterThanOrEqual(-0.01);
        if (leg.foot.y < 0.5) planted++;
      }
    }
    expect(planted).toBeGreaterThan(300);
  });

  it('keeps the tail joined up, and blown back when running', () => {
    const rig = new WolfRig();
    const r = running();
    for (let i = 0; i < 240; i++) rig.update(DT, r, false);
    const { tail } = rig.pose();
    for (let i = 1; i < tail.length; i++) expect(gap(tail[i - 1], tail[i])).toBeCloseTo(7, 0);
    expect(tail[tail.length - 1].x).toBeLessThan(tail[0].x - 20);
  });

  it('squashes on landing and springs back', () => {
    const rig = new WolfRig();
    const r = running();
    rig.update(DT, r, true);
    let low = 0;
    for (let i = 0; i < 12; i++) {
      rig.update(DT, r, false);
      low = Math.min(low, rig.pose().squash);
    }
    expect(low).toBeLessThan(-0.01);
    for (let i = 0; i < 240; i++) rig.update(DT, r, false);
    expect(Math.abs(rig.pose().squash)).toBeLessThan(0.002);
  });

  it('never lets the dust pile up', () => {
    const rig = new WolfRig();
    const r = running();
    for (let i = 0; i < 600; i++) rig.update(DT, r, i % 40 === 0);
    expect(rig.dust.length).toBeLessThanOrEqual(60);
  });
});

describe('the crash', () => {
  it('throws the wolf, then lets it sink down upright on the ground', () => {
    const rig = new WolfRig();
    const r = running();
    rig.update(DT, r, false);
    r.phase = 'over';
    let top = 0;
    for (let i = 0; i < 480; i++) {
      rig.update(DT, r, false);
      top = Math.max(top, rig.pose().y);
    }
    expect(top).toBeGreaterThan(20);
    const end = rig.pose();
    expect(end.y).toBe(0);
    expect(Math.abs(Math.sin(end.rotation / 2))).toBeLessThan(0.01);
    expect(end.chest.y).toBeLessThan(20);
    rig.reset();
    expect(rig.pose().rotation).toBe(0);
  });
});
