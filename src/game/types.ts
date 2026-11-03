import type { BoostId } from './boosts';
import type { PenModelId } from './pens';
import type { PowerId } from './powers';

export type Vec = { x: number; y: number };

export type PlayerId = 0 | 1;

/** The pen a player brings to a match, and the hero power on it, if any. */
export interface Loadout {
  model: PenModelId;
  power: PowerId | null;
}

/**
 * A pen as the game sees it, in desk pixels from above.
 * The full 3D body lives in the Rapier world (`world.ts`); this is its snapshot.
 */
export interface Pen {
  id: PlayerId;
  model: PenModelId;
  power: PowerId | null;
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

/** How a round ended: a pen knocked off, the shooter sliding off, or both pens falling. */
export type RoundReason = 'knocked' | 'fell' | 'draw';

/** A super power waiting for a shot: armed by `by`, changing `target`'s next shot. */
export interface ArmedBoost {
  id: BoostId;
  by: PlayerId;
  target: PlayerId;
}

export interface GameState {
  /** What each player brought to this match. */
  loadouts: [Loadout, Loadout];
  pens: [Pen, Pen];
  turn: PlayerId;
  /** Who shot first this round. */
  starter: PlayerId;
  /** Round wins; first to `WIN_SCORE` takes the match. */
  scores: [number, number];
  round: number;
  phase: Phase;
  /** Winner of the round just finished; null for a draw. */
  roundWinner: PlayerId | null;
  roundReason: RoundReason | null;
  /** Super powers waiting for a shot. */
  armed: ArmedBoost[];
  /** Spare lives from Health Boost, this round only. */
  lives: [number, number];
  /** The super power the player on turn has armed for their shot; one a shot. */
  boostThisTurn: BoostId | null;
  /** The super power the other player has armed against this shot; one a shot. */
  defenseThisTurn: BoostId | null;
  /** Pens a Health Boost put back on the desk in the shot just resolved. */
  saved: PlayerId[];
}
