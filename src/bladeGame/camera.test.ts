import { describe, expect, it } from 'vitest';
import { clearDistance, lockOnDistance, stepsDue, stickToWorld, unturn } from './camera';

describe('the lock-on camera', () => {
  it('backs away as fighters separate, within limits', () => {
    expect(lockOnDistance(6, 1)).toBeGreaterThan(lockOnDistance(1, 1));
    expect(lockOnDistance(50, 1)).toBe(9);
    expect(lockOnDistance(0, 0)).toBe(4.2);
  });

  it('pulls in when a pillar blocks the view, and not otherwise', () => {
    const pillar = { x: 0, z: -4, radius: 0.8 };
    expect(clearDistance(0, 0, 0, -1, 7, [pillar])).toBeLessThan(4);
    expect(clearDistance(0, 0, 0, -1, 3, [pillar])).toBe(3);
    expect(clearDistance(3, 0, 0, -1, 7, [pillar])).toBe(7);
    expect(clearDistance(0, 0, 0, -1, 7, [{ x: 0, z: -0.5, radius: 1 }])).toBe(1.6);
  });
});

describe('controls', () => {
  it('moves relative to the camera', () => {
    expect(stickToWorld(0, 1, 0, 1)).toEqual({ x: 0, z: 1 });
    expect(stickToWorld(1, 0, 0, 1).x).toBe(1);
    expect(stickToWorld(0, 1, 1, 0)).toEqual({ x: 1, z: 0 });
  });

  it('reads a drag correctly when the game is turned sideways', () => {
    expect(unturn(0, 10, true).x).toBe(10);
    expect(unturn(10, 0, false)).toEqual({ x: 10, y: 0 });
  });
});

describe('fixed steps', () => {
  it('keeps the remainder, and never bursts after a long gap', () => {
    expect(stepsDue(0, 20, 16)).toEqual({ steps: 1, spareMs: 4 });
    expect(stepsDue(0, 60_000, 16).steps).toBe(6);
  });
});

describe('reading Mixamo files', () => {
  it('sorts animations into moves by their names', async () => {
    const { slotFor } = await import('../../scripts/clipSlots.mjs');
    expect(slotFor('great sword idle.fbx')).toBe('idle');
    expect(slotFor('great sword run.fbx')).toBe('run');
    expect(slotFor('great sword slash.fbx')).toBe('light1');
    expect(slotFor('great sword slash (2).fbx')).toBe('light2');
    expect(slotFor('great sword blocking.fbx')).toBe('guard');
    expect(slotFor('great sword impact.fbx')).toBe('hit');
    expect(slotFor('two hand sword death.fbx')).toBe('death');
    expect(slotFor('stand to roll.fbx')).toBe('dodge');
    expect(slotFor('great sword high spin attack.fbx')).toBe('special');
    expect(slotFor('dance.fbx')).toBeNull();
  });
});
