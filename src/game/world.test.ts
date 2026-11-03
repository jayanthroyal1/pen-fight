import { beforeAll, describe, expect, it } from 'vitest';
import { DESK, HALF_SEG, createPen } from './physics';
import type { Pen } from './types';
import { DeskWorld, initPhysics } from './world';

beforeAll(initPhysics);

const pair = (a: Pen, b: Pen): [Pen, Pen] => [a, b];
const far = () => createPen(1, 100, 100, 0);

describe('DeskWorld', () => {
  it('keeps resting pens where they are', () => {
    const world = new DeskWorld(pair(createPen(0, 300, 250, 0), far()));
    for (let i = 0; i < 60; i++) world.step();
    const [pen] = world.read();
    expect(pen.x).toBeCloseTo(300, 0);
    expect(pen.y).toBeCloseTo(250, 0);
    expect(pen.out).toBe(false);
    world.free();
  });

  it('slides a flicked pen and lets friction stop it', () => {
    const world = new DeskWorld(pair(createPen(0, 200, 250, Math.PI / 2), far()));
    world.flick(0, { along: 0, ix: 400, iy: 0 });
    world.settle();
    const [pen] = world.read();
    expect(pen.x).toBeGreaterThan(250);
    expect(pen.out).toBe(false);
    world.free();
  });

  it('spins a pen flicked near its tip', () => {
    const world = new DeskWorld(pair(createPen(0, 400, 250, 0), far()));
    world.flick(0, { along: HALF_SEG, ix: 0, iy: 500 });
    world.settle();
    const [pen] = world.read();
    expect(Math.abs(pen.angle)).toBeGreaterThan(0.3);
    world.free();
  });

  it('drops a pen that slides off the edge', () => {
    const world = new DeskWorld(pair(createPen(0, DESK.width - 40, 250, Math.PI / 2), far()));
    world.flick(0, { along: 0, ix: 800, iy: 0 });
    world.settle();
    const [pen] = world.read();
    expect(pen.out).toBe(true);
    expect(pen.h).toBeLessThan(0);
    world.free();
  });

  it('a more powerful pen knocks the other further', () => {
    const shove = (shooter: 'exec-gold-clip' | 'inkmax-aqua', target: 'exec-gold-clip' | 'inkmax-aqua') => {
      const world = new DeskWorld(
        pair(
          createPen(0, 250, 250, Math.PI / 2, shooter),
          createPen(1, 380, 250, Math.PI / 2, target),
        ),
      );
      world.flick(0, { along: 0, ix: 700, iy: 0 });
      world.settle();
      const moved = world.read()[1].x - 380;
      world.free();
      return moved;
    };
    expect(shove('exec-gold-clip', 'inkmax-aqua')).toBeGreaterThan(shove('inkmax-aqua', 'exec-gold-clip') * 1.5);
  });

  it('a hero power gives the same pen a little more push', () => {
    const slide = (power: 'giant' | null) => {
      const world = new DeskWorld(pair(createPen(0, 150, 250, Math.PI / 2, 'click-red', power), far()));
      world.flick(0, { along: 0, ix: 500, iy: 0 });
      world.settle();
      const x = world.read()[0].x;
      world.free();
      return x - 150;
    };
    expect(slide('giant')).toBeGreaterThan(slide(null) * 1.1);
  });

  it('reports a pen-on-pen hit and a fall as impacts', () => {
    const world = new DeskWorld(
      pair(createPen(0, 600, 250, Math.PI / 2), createPen(1, 730, 250, Math.PI / 2)),
      true,
    );
    world.flick(0, { along: 0, ix: 1200, iy: 0 });
    const impacts = [];
    while (!world.isSettled()) {
      world.step();
      impacts.push(...world.drainImpacts());
    }
    world.free();
    const hit = impacts.find((i) => i.kind === 'pens');
    expect(hit && hit.kind === 'pens' && hit.strength).toBeGreaterThan(0.2);
    expect(impacts.some((i) => i.kind === 'fall' && i.pen === 1)).toBe(true);
  });

  it('knocks the other pen when they collide', () => {
    const world = new DeskWorld(
      pair(createPen(0, 300, 250, Math.PI / 2), createPen(1, 420, 250, Math.PI / 2)),
    );
    world.flick(0, { along: 0, ix: 900, iy: 0 });
    world.settle();
    const [, hit] = world.read();
    expect(hit.x).toBeGreaterThan(440);
    world.free();
  });
});

describe('the same shot on two devices', () => {
  it('plays out identically after a restart, whatever came before', () => {
    const start = pair(createPen(0, 560, 250, 1.4), createPen(1, 300, 240, 1.7));
    // One device played an earlier shot and kept its world; the other starts fresh.
    const a = new DeskWorld(start, true);
    a.flick(0, { along: 30, ix: -700, iy: 40 });
    a.settle();
    const synced = a.read();
    const b = new DeskWorld(synced, true);
    a.restart(synced);
    b.restart(synced);
    for (const w of [a, b]) {
      w.flick(1, { along: -20, ix: 900, iy: -60 });
      w.settle();
    }
    expect(a.read()).toEqual(b.read());
    a.free();
    b.free();
  });
});
