import type { PenModelId } from './pens';
import { DESK, createPen } from './physics';
import type { GameState, Pen, PlayerId } from './types';

export const WIN_SCORE = 3;

/**
 * Starting layout for a round. Deterministic per round number so that
 * both players in an online match set up the same desk.
 */
export function startPens(round: number, models: [PenModelId, PenModelId]): [Pen, Pen] {
  const tilt = Math.sin(round * 1.7) * 0.25;
  const cy = DESK.height / 2;
  return [
    createPen(0, DESK.width * 0.3, cy, Math.PI / 2 + tilt, models[0]),
    createPen(1, DESK.width * 0.7, cy, Math.PI / 2 - tilt, models[1]),
  ];
}

export function newMatch(models: [PenModelId, PenModelId] = ['cello', 'cello']): GameState {
  return {
    models,
    pens: startPens(1, models),
    turn: 0,
    scores: [0, 0],
    round: 1,
    phase: 'aim',
    roundWinner: null,
    roundReason: null,
  };
}

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

/** Decides what happens once a shot by `shooter` has come to rest. */
export function resolveShot(state: GameState, shooter: PlayerId): GameState {
  const opponent = other(shooter);
  // Falling off your own desk loses the round, even if you took the other pen with you.
  const winner = state.pens[shooter].out
    ? opponent
    : state.pens[opponent].out
      ? shooter
      : null;

  if (winner === null) {
    return { ...state, turn: opponent, phase: 'aim' };
  }

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

/** Sets up the next round; the player who lost the round shoots first. */
export function nextRound(state: GameState): GameState {
  const round = state.round + 1;
  return {
    ...state,
    pens: startPens(round, state.models),
    round,
    turn: state.roundWinner === null ? 0 : other(state.roundWinner),
    phase: 'aim',
    roundWinner: null,
    roundReason: null,
  };
}
