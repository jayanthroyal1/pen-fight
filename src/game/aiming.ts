import { MAX_IMPULSE } from './physics';
import type { Flick, Vec } from './types';

/** A pull-back drag on a pen, tracked both on the desk and on the screen. */
export interface Drag {
  /** Where on the pen it was grabbed: distance from its centre along its axis, desk px. */
  along: number;
  /** Pointer positions projected onto the desk, desk px. */
  pressDesk: Vec;
  currentDesk: Vec;
  /** Pointer positions on the screen, CSS px. */
  pressScreen: Vec;
  currentScreen: Vec;
}

/** Pulls shorter than this, in CSS px, cancel the flick. */
export const MIN_PULL_PX = 10;

export function pullPixels(drag: Drag): number {
  return Math.hypot(drag.pressScreen.x - drag.currentScreen.x, drag.pressScreen.y - drag.currentScreen.y);
}

/** 0..1: how hard the pull is, measured on screen so it feels the same anywhere on the desk. */
export function pullPower(drag: Drag, maxPullPx: number): number {
  return Math.min(1, pullPixels(drag) / maxPullPx);
}

/**
 * The flick a drag makes: aimed away from the pull on the desk (so the
 * camera's perspective doesn't bend the aim), with power from the screen pull.
 */
export function flickFromPull(drag: Drag, maxPullPx: number): Flick {
  const dx = drag.pressDesk.x - drag.currentDesk.x;
  const dy = drag.pressDesk.y - drag.currentDesk.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { along: drag.along, ix: 0, iy: 0 };
  const j = pullPower(drag, maxPullPx) * MAX_IMPULSE;
  return { along: drag.along, ix: (dx / len) * j, iy: (dy / len) * j };
}

/** Eases the shown aim towards the target, `k` 0..1 of the way per call. */
export function easeFlick(shown: Flick, target: Flick, k: number): Flick {
  // Ease power and angle separately so a turning aim swings round instead of shrinking.
  const ts = Math.hypot(target.ix, target.iy);
  const ss = Math.hypot(shown.ix, shown.iy);
  const ta = Math.atan2(target.iy, target.ix);
  let sa = ss > 1e-6 ? Math.atan2(shown.iy, shown.ix) : ta;
  let da = ta - sa;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  sa += da * k;
  const s = ss + (ts - ss) * k;
  return {
    along: shown.along + (target.along - shown.along) * k,
    ix: Math.cos(sa) * s,
    iy: Math.sin(sa) * s,
  };
}
