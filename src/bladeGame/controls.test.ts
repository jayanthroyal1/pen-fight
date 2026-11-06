import { describe, expect, it } from 'vitest';
import { CONTROL_IDS, MAX_SCALE, MIN_SCALE, defaultLayout, moveControl, parseLayout, resizeAll, resizeControl, setOpacity } from './controls';

describe('the control layout', () => {
  it('starts with every control on screen', () => {
    const { places } = defaultLayout();
    for (const id of CONTROL_IDS) {
      expect(places[id].x).toBeGreaterThan(0);
      expect(places[id].x).toBeLessThan(1);
      expect(places[id].y).toBeLessThan(1);
    }
  });

  it('moves a control, and never off the screen', () => {
    const moved = moveControl(defaultLayout(), 'light', 0.4, 0.3, 800, 400);
    expect(moved.places.light).toMatchObject({ x: 0.4, y: 0.3 });
    const edge = moveControl(defaultLayout(), 'stick', -1, 2, 800, 400);
    expect(edge.places.stick.x).toBeCloseTo(64 / 800);
    expect(edge.places.stick.y).toBeCloseTo(1 - 64 / 400);
  });

  it('changes one control without touching the others, or the original', () => {
    const start = defaultLayout();
    const next = resizeControl(start, 'guard', 1.3);
    expect(next.places.guard.scale).toBe(1.3);
    expect(next.places.light).toEqual(start.places.light);
    expect(start.places.guard.scale).toBe(1);
  });

  it('sizes every control together', () => {
    const all = resizeAll(defaultLayout(), 1.2);
    for (const id of CONTROL_IDS) expect(all.places[id].scale).toBe(1.2);
    expect(all.places.light.x).toBe(defaultLayout().places.light.x);
    expect(resizeAll(defaultLayout(), 5).places.stick.scale).toBe(MAX_SCALE);
  });

  it('keeps size and opacity within limits', () => {
    expect(resizeControl(defaultLayout(), 'light', 9).places.light.scale).toBe(MAX_SCALE);
    expect(resizeControl(defaultLayout(), 'light', 0).places.light.scale).toBe(MIN_SCALE);
    expect(setOpacity(defaultLayout(), 0).opacity).toBe(0.2);
  });

  it('survives a damaged save, and keeps what it can', () => {
    expect(parseLayout('not json')).toEqual(defaultLayout());
    expect(parseLayout(null)).toEqual(defaultLayout());
    const partial = parseLayout(JSON.stringify({ opacity: 0.5, places: { light: { x: 0.2, y: 0.2, scale: 1.2 }, heavy: { x: 'a' } } }));
    expect(partial.places.light).toEqual({ x: 0.2, y: 0.2, scale: 1.2 });
    expect(partial.places.heavy).toEqual(defaultLayout().places.heavy);
    expect(partial.opacity).toBe(0.5);
  });
});
