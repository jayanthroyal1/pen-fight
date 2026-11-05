import type { BoostBag, BoostId } from './boosts';
import { HALF_SEG, MAX_IMPULSE, edgeDistance, pointOnPen } from './physics';
import { boostProblem, shotMods } from './rules';
import type { Flick, GameState, PlayerId } from './types';
import { DeskWorld } from './world';

export type Difficulty = 'easy' | 'medium' | 'hard';

/** How the computer plays at each difficulty: how many shots it tries, how steady its aim is. */
export const DIFFICULTY: Record<Difficulty, { label: string; samples: number; wobble: number; boosts: number }> = {
  easy: { label: 'Easy', samples: 10, wobble: 0.3, boosts: 1 },
  medium: { label: 'Medium', samples: 35, wobble: 0.1, boosts: 2 },
  hard: { label: 'Hard', samples: 90, wobble: 0.02, boosts: 3 },
};

/** Closer than this (desk px) to an edge, a pen is in danger. */
const DANGER = 110;

/**
 * Whether the computer uses a super power on this shot, and which. On its own
 * turn it attacks when the other pen is near an edge; while the other player
 * aims it defends when its own pen is near an edge, or makes the desk slippery
 * when the shooter is close to one. Now and then it plays one for the fun of it.
 */
export function chooseAiBoost(state: GameState, me: PlayerId, bag: BoostBag, rng: () => number = Math.random): BoostId | null {
  const has = (id: BoostId) => (bag[id] ?? 0) > 0 && !boostProblem(state, me, id);
  const mine = edgeDistance(state.pens[me]);
  const theirs = edgeDistance(state.pens[me === 0 ? 1 : 0]);
  const pickFrom = (ids: BoostId[]) => {
    const ok = ids.filter(has);
    return ok.length ? ok[Math.floor(rng() * ok.length)] : null;
  };
  if (state.turn === me) {
    if (theirs < DANGER && rng() < 0.7) return pickFrom(['lightning', 'strike', 'double']);
    if (rng() < 0.15) return pickFrom(['strike', 'lightning']);
    return null;
  }
  if (mine < DANGER && rng() < 0.7) return pickFrom(['wall', 'grip', 'health']);
  if (theirs < DANGER && rng() < 0.5) return pickFrom(['ice', 'tilt']);
  if (rng() < 0.15) return pickFrom(['ice', 'tilt', 'grip']);
  return null;
}

export interface AiOptions {
  rng?: () => number;
  samples?: number;
  /** Aim wobble in radians; 0 makes the computer play its best found shot exactly. */
  wobble?: number;
}

/** Shots tried between breaths, so the screen keeps moving while the computer thinks. */
const SAMPLES_PER_SLICE = 6;

/**
 * Picks a shot by trying many random flicks aimed roughly at the opponent,
 * simulating each to rest in Rapier and keeping the one that ends best for `me`.
 * Yields every few shots; `chooseAiShot` runs it straight through.
 */
function* searchShot(state: GameState, me: PlayerId, opts: AiOptions): Generator<void, Flick> {
  const { rng = Math.random, samples = 60, wobble = 0.05 } = opts;
  const mine = state.pens[me];
  const theirs = state.pens[me === 0 ? 1 : 0];
  const world = new DeskWorld(state.pens, false, true);
  world.setMods(shotMods(state, me), me);

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
      if (i % SAMPLES_PER_SLICE === SAMPLES_PER_SLICE - 1) yield;
    }
  } finally {
    world.free();
  }

  if (wobble === 0) return best;
  const angle = Math.atan2(best.iy, best.ix) + (rng() - 0.5) * 2 * wobble;
  const power = Math.hypot(best.ix, best.iy) * (0.92 + rng() * 0.16);
  return { along: best.along, ix: Math.cos(angle) * power, iy: Math.sin(angle) * power };
}

export function chooseAiShot(state: GameState, me: PlayerId, opts: AiOptions = {}): Flick {
  const search = searchShot(state, me, opts);
  for (;;) {
    const step = search.next();
    if (step.done) return step.value;
  }
}

/**
 * The same search in slices, leaving the browser free to draw in between.
 * `cancelled` stops it early, returning null.
 */
export async function chooseAiShotSoon(
  state: GameState,
  me: PlayerId,
  opts: AiOptions,
  cancelled: () => boolean,
): Promise<Flick | null> {
  const search = searchShot(state, me, opts);
  for (;;) {
    const step = search.next();
    if (step.done) return step.value;
    await new Promise((r) => setTimeout(r));
    if (cancelled()) {
      search.return({ along: 0, ix: 0, iy: 0 });
      return null;
    }
  }
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
