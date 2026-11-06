/**
 * Where the on-screen controls sit. Positions are shares of the screen, so a
 * layout carries over between phones. Saved per device.
 */

export type ControlId = 'stick' | 'light' | 'heavy' | 'guard' | 'dodge' | 'special';

export interface ControlPlace {
  /** The control's centre, 0 to 1 across and down the screen. */
  x: number;
  y: number;
  /** Multiplies its normal size. */
  scale: number;
}

export interface ControlLayout {
  places: Record<ControlId, ControlPlace>;
  /** How solid the controls look, 0.2 to 1. */
  opacity: number;
}

export const CONTROL_IDS: ControlId[] = ['stick', 'light', 'heavy', 'guard', 'dodge', 'special'];

export const CONTROL_NAMES: Record<ControlId, string> = { stick: 'Joystick', light: 'Light', heavy: 'Heavy', guard: 'Guard', dodge: 'Dodge', special: 'Special' };

/** Normal diameters, in pixels. */
export const BASE_SIZE: Record<ControlId, number> = { stick: 128, light: 88, heavy: 66, guard: 66, dodge: 66, special: 66 };

export const MIN_SCALE = 0.7;
export const MAX_SCALE = 1.6;
const MIN_OPACITY = 0.2;
const KEY = 'wildplayers:blade-controls';

export const defaultLayout = (): ControlLayout => ({
  opacity: 0.85,
  places: {
    stick: { x: 0.14, y: 0.72, scale: 1 },
    light: { x: 0.9, y: 0.76, scale: 1 },
    heavy: { x: 0.77, y: 0.84, scale: 1 },
    guard: { x: 0.765, y: 0.58, scale: 1 },
    dodge: { x: 0.87, y: 0.44, scale: 1 },
    special: { x: 0.665, y: 0.7, scale: 1 },
  },
});

const clamp = (v: number, low: number, high: number) => Math.min(high, Math.max(low, v));

/** Moves a control, keeping all of it on the screen. */
export function moveControl(layout: ControlLayout, id: ControlId, x: number, y: number, screenW: number, screenH: number): ControlLayout {
  const place = layout.places[id];
  const half = (BASE_SIZE[id] * place.scale) / 2;
  const edgeX = Math.min(0.5, half / screenW);
  const edgeY = Math.min(0.5, half / screenH);
  return { ...layout, places: { ...layout.places, [id]: { ...place, x: clamp(x, edgeX, 1 - edgeX), y: clamp(y, edgeY, 1 - edgeY) } } };
}

export function resizeControl(layout: ControlLayout, id: ControlId, scale: number): ControlLayout {
  return { ...layout, places: { ...layout.places, [id]: { ...layout.places[id], scale: clamp(scale, MIN_SCALE, MAX_SCALE) } } };
}

/** One size for every control at once. */
export function resizeAll(layout: ControlLayout, scale: number): ControlLayout {
  const places = { ...layout.places };
  for (const id of CONTROL_IDS) places[id] = { ...places[id], scale: clamp(scale, MIN_SCALE, MAX_SCALE) };
  return { ...layout, places };
}

export const setOpacity = (layout: ControlLayout, opacity: number): ControlLayout => ({ ...layout, opacity: clamp(opacity, MIN_OPACITY, 1) });

/** Reads a saved layout, repairing anything missing or out of range. */
export function parseLayout(text: string | null): ControlLayout {
  const fresh = defaultLayout();
  try {
    const saved = JSON.parse(text ?? 'null') as Partial<ControlLayout> | null;
    if (!saved?.places) return fresh;
    for (const id of CONTROL_IDS) {
      const p = saved.places[id];
      if (!p || ![p.x, p.y, p.scale].every(Number.isFinite)) continue;
      fresh.places[id] = { x: clamp(p.x, 0, 1), y: clamp(p.y, 0, 1), scale: clamp(p.scale, MIN_SCALE, MAX_SCALE) };
    }
    if (Number.isFinite(saved.opacity)) fresh.opacity = clamp(saved.opacity as number, MIN_OPACITY, 1);
    return fresh;
  } catch {
    return fresh;
  }
}

export function readLayout(): ControlLayout {
  try {
    return parseLayout(localStorage.getItem(KEY));
  } catch {
    return defaultLayout();
  }
}

export function saveLayout(layout: ControlLayout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // Remembering is only a convenience.
  }
}
