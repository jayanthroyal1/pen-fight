import { HALF_SEG, MAX_IMPULSE, edgeDistance, pointOnPen } from './physics';
import type { Flick, GameState, PlayerId } from './types';
import { DeskWorld } from './world';

export interface AiOptions {
  rng?: () => number;
  samples?: number;
  /** Aim wobble in radians; 0 makes the computer play its best found shot exactly. */
  wobble?: number;
}

/**
 * Picks a shot by trying many random flicks aimed roughly at the opponent,
 * simulating each to rest in Rapier and keeping the one that ends best for `me`.
 */
export function chooseAiShot(state: GameState, me: PlayerId, opts: AiOptions = {}): Flick {
  const { rng = Math.random, samples = 60, wobble = 0.05 } = opts;
  const mine = state.pens[me];
  const theirs = state.pens[me === 0 ? 1 : 0];
  const world = new DeskWorld(state.pens);

  let best: Flick = { along: 0, ix: 0, iy: 0 };
  let bestScore = -Infinity;
  try {
    for (let i = 0; i < samples; i++) {
      const along = (rng() * 2 - 1) * HALF_SEG * 0.9;
      const from = pointOnPen(mine, along);
      const toTarget = Math.atan2(theirs.y - from.y, theirs.x - from.x);
      const angle = toTarget + (rng() - 0.5) * 1.2;
      const power = MAX_IMPULSE * (0.3 + rng() * 0.7);
      const flick = { along, ix: Math.cos(angle) * power, iy: Math.sin(angle) * power };
      const score = evaluate(world, state, me, flick);
      if (score > bestScore) {
        bestScore = score;
        best = flick;
      }
    }
  } finally {
    world.free();
  }

  if (wobble === 0) return best;
  const angle = Math.atan2(best.iy, best.ix) + (rng() - 0.5) * 2 * wobble;
  const power = Math.hypot(best.ix, best.iy) * (0.92 + rng() * 0.16);
  return { along: best.along, ix: Math.cos(angle) * power, iy: Math.sin(angle) * power };
}

function evaluate(world: DeskWorld, state: GameState, me: PlayerId, flick: Flick): number {
  world.load(state.pens);
  world.flick(me, flick);
  world.settle();
  const pens = world.read();
  const mine = pens[me];
  const theirs = pens[me === 0 ? 1 : 0];
  if (mine.out) return -1000;
  if (theirs.out) return 1000 + edgeDistance(mine);
  // Push the opponent towards an edge while staying away from one yourself.
  return -edgeDistance(theirs) + 0.6 * edgeDistance(mine);
}
