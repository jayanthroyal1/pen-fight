import { DESK, createPen } from './physics';
import type { GameState, Loadout, Pen, PlayerId } from './types';

/**
 * A match is best of three: two round wins take it. A draw (both pens off in
 * one shot) scores nothing, and the next round settles it. At 1–1 the next
 * round is the final round.
 */
export const WIN_SCORE = 2;

/**
 * Starting layout for a round: player 1's pen at the near end of the desk,
 * player 2's at the far end. Deterministic per round, so both players in an
 * online match set up the same desk.
 */
export function startPens(round: number, loadouts: [Loadout, Loadout]): [Pen, Pen] {
  const tilt = Math.sin(round * 1.7) * 0.25;
  const cy = DESK.height / 2;
  return [
    createPen(0, DESK.width * 0.72, cy, Math.PI / 2 - tilt, loadouts[0].model, loadouts[0].power),
    createPen(1, DESK.width * 0.28, cy, Math.PI / 2 + tilt, loadouts[1].model, loadouts[1].power),
  ];
}

const DEFAULT: [Loadout, Loadout] = [
  { model: 'cello', power: null },
  { model: 'cello', power: null },
];

export function newMatch(loadouts: [Loadout, Loadout] = DEFAULT): GameState {
  return {
    loadouts,
    pens: startPens(1, loadouts),
    turn: 0,
    starter: 0,
    scores: [0, 0],
    round: 1,
    phase: 'aim',
    roundWinner: null,
    roundReason: null,
  };
}

export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

/** The deciding round: both players one win from the match. */
export const isFinalRound = (s: GameState) => s.scores[0] === WIN_SCORE - 1 && s.scores[1] === WIN_SCORE - 1;

/** Decides what happens once a shot by `shooter` has come to rest. */
export function resolveShot(state: GameState, shooter: PlayerId): GameState {
  const opponent = other(shooter);
  const shooterOut = state.pens[shooter].out;
  const opponentOut = state.pens[opponent].out;

  if (shooterOut && opponentOut) {
    return { ...state, phase: 'roundOver', roundWinner: null, roundReason: 'draw' };
  }
  const winner = shooterOut ? opponent : opponentOut ? shooter : null;
  if (winner === null) return { ...state, turn: opponent, phase: 'aim' };

  const scores: [number, number] = [...state.scores];
  scores[winner] += 1;
  return {
    ...state,
    scores,
    phase: scores[winner] >= WIN_SCORE ? 'matchOver' : 'roundOver',
    roundWinner: winner,
    roundReason: winner === shooter ? 'knocked' : 'fell',
  };
}

/** Sets up the next round: the round's loser shoots first, or after a draw the other player. */
export function nextRound(state: GameState): GameState {
  const round = state.round + 1;
  const starter = state.roundWinner === null ? other(state.starter) : other(state.roundWinner);
  return {
    ...state,
    pens: startPens(round, state.loadouts),
    round,
    turn: starter,
    starter,
    phase: 'aim',
    roundWinner: null,
    roundReason: null,
  };
}

/** The match winner, once the match is over. */
export function matchWinner(state: GameState): PlayerId | null {
  if (state.phase !== 'matchOver') return null;
  return state.scores[0] >= WIN_SCORE ? 0 : state.scores[1] >= WIN_SCORE ? 1 : null;
}
