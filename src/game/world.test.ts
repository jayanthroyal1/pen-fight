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
    const shove = (shooter: 'retro51' | 'ballpoint', target: 'retro51' | 'ballpoint') => {
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
    expect(shove('retro51', 'ballpoint')).toBeGreaterThan(shove('ballpoint', 'retro51') * 1.5);
  });

  it('a hero power gives the same pen a little more push', () => {
    const slide = (power: 'giant' | null) => {
      const world = new DeskWorld(pair(createPen(0, 150, 250, Math.PI / 2, 'cello', power), far()));
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
      pair(createPen(0, 560, 250, Math.PI / 2), createPen(1, 680, 250, Math.PI / 2)),
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
