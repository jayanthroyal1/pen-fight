import type { PenModelId } from './pens';

export type Vec = { x: number; y: number };

export type PlayerId = 0 | 1;

/**
 * A pen as the game sees it, in desk pixels from above.
 * The full 3D body lives in the Rapier world (`world.ts`); this is its snapshot.
 */
export interface Pen {
  id: PlayerId;
  model: PenModelId;
  x: number;
  y: number;
  /** Heading of the pen's tip, in radians, in the desk plane. */
  angle: number;
  /** Height of the centre above the desk top, in pixels; negative once falling. */
  h: number;
  /** Full 3D orientation as a quaternion [x, y, z, w]. */
  q: [number, number, number, number];
  /** True once the pen has fallen off the desk. */
  out: boolean;
}

/**
 * A flick: a horizontal impulse applied to a pen at a point on its axis.
 * `along` is the signed distance from the pen's centre towards its tip.
 */
export interface Flick {
  along: number;
  ix: number;
  iy: number;
}

export type Phase = 'aim' | 'moving' | 'roundOver' | 'matchOver';

export type RoundReason = 'knocked' | 'fell';

export interface GameState {
  /** The pen each player chose for this match. */
  models: [PenModelId, PenModelId];
  pens: [Pen, Pen];
  turn: PlayerId;
  scores: [number, number];
  round: number;
  phase: Phase;
  roundWinner: PlayerId | null;
  roundReason: RoundReason | null;
}
