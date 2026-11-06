import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { poseFor } from './pose';
import { ARENA_HALF, SwordWorld, loadPhysics, partEnds } from './world';

const stand = () => poseFor({ stance: 'idle', time: 0, stride: 0, swing: 0, combo: 0, vy: 0 });
const settle = (w: SwordWorld, n = 60) => {
  for (let i = 0; i < n; i++) w.step();
};

describe('the fight’s physics', () => {
  beforeAll(loadPhysics);

  it('stands a fighter on the ground, jumps, and lands', () => {
    const w = new SwordWorld();
    const f = w.addFighter(0);
    settle(w);
    expect(w.feet(f).y).toBeLessThan(0.06);
    expect(w.grounded(f)).toBe(true);
    w.jump(f);
    settle(w, 15);
    expect(w.feet(f).y).toBeGreaterThan(0.8);
    expect(w.grounded(f)).toBe(false);
    settle(w, 90);
    expect(w.grounded(f)).toBe(true);
    w.dispose();
  });

  it('stops at the walls', () => {
    const w = new SwordWorld();
    const f = w.addFighter(0);
    for (let i = 0; i < 300; i++) {
      w.run(f, 12);
      w.step();
    }
    expect(w.feet(f).x).toBeLessThan(ARENA_HALF);
    w.dispose();
  });

  it('keeps fighters from walking through each other', () => {
    const w = new SwordWorld();
    const a = w.addFighter(-2);
    const b = w.addFighter(2);
    settle(w, 10);
    for (let i = 0; i < 200; i++) {
      w.run(a, 5);
      w.run(b, -5);
      w.step();
    }
    expect(w.feet(b).x - w.feet(a).x).toBeGreaterThan(0.5);
    w.dispose();
  });

  it('tells a blade that reaches from one that doesn’t', () => {
    const w = new SwordWorld();
    const f = w.addFighter(2);
    settle(w, 10);
    w.step();
    const hilt = new THREE.Vector3(0.6, 1.1, 0);
    expect(w.touches(hilt, new THREE.Vector3(1.9, 1.1, 0), f)).toBe(true);
    expect(w.touches(hilt, new THREE.Vector3(1.2, 1.1, 0), f)).toBe(false);
    w.dispose();
  });

  it('throws a knocked-out fighter as a ragdoll that stays in one piece and comes to rest', () => {
    const w = new SwordWorld();
    const f = w.addFighter(0);
    settle(w, 10);
    const doll = w.fall(f, stand(), 1, 7, 5, 1.05);
    expect(doll.parts).toHaveLength(9);
    settle(w, 300);
    const torso = doll.parts[0].body.translation();
    expect(torso.x).toBeGreaterThan(0.5);
    expect(torso.y).toBeLessThan(0.6);
    expect(torso.y).toBeGreaterThan(-0.1);
    const [, neck] = partEnds(doll.parts[0]);
    const [shoulder] = partEnds(doll.parts[1]);
    expect(neck.distanceTo(shoulder)).toBeLessThan(0.35);
    w.dispose();
  });
});
