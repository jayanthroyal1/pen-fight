import { describe, expect, it } from 'vitest';
import { WIN_SCORE, newMatch, nextRound, resolveShot } from './rules';
import type { GameState } from './types';

function withOut(state: GameState, out: [boolean, boolean]): GameState {
  return {
    ...state,
    pens: [
      { ...state.pens[0], out: out[0] },
      { ...state.pens[1], out: out[1] },
    ],
  };
}

describe('resolveShot', () => {
  it('passes the turn when nobody falls', () => {
    const s = resolveShot(newMatch(), 0);
    expect(s.turn).toBe(1);
    expect(s.phase).toBe('aim');
  });

  it('gives the round to the shooter who knocks the other pen off', () => {
    const s = resolveShot(withOut(newMatch(), [false, true]), 0);
    expect(s.roundWinner).toBe(0);
    expect(s.roundReason).toBe('knocked');
    expect(s.scores).toEqual([1, 0]);
    expect(s.phase).toBe('roundOver');
  });

  it('gives the round to the opponent when the shooter falls off', () => {
    const s = resolveShot(withOut(newMatch(), [true, false]), 0);
    expect(s.roundWinner).toBe(1);
    expect(s.roundReason).toBe('fell');
  });

  it('counts both pens falling as a loss for the shooter', () => {
    const s = resolveShot(withOut(newMatch(), [true, true]), 0);
    expect(s.roundWinner).toBe(1);
  });

  it('ends the match at the winning score', () => {
    const start: GameState = { ...newMatch(), scores: [WIN_SCORE - 1, 0] };
    const s = resolveShot(withOut(start, [false, true]), 0);
    expect(s.phase).toBe('matchOver');
  });
});

describe('nextRound', () => {
  it('resets the desk and lets the round loser shoot first', () => {
    const won = resolveShot(withOut(newMatch(), [false, true]), 0);
    const s = nextRound(won);
    expect(s.round).toBe(2);
    expect(s.turn).toBe(1);
    expect(s.pens.every((p) => !p.out)).toBe(true);
    expect(s.scores).toEqual([1, 0]);
  });
});
