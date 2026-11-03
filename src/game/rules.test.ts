import { describe, expect, it } from 'vitest';
import { DESK } from './physics';
import { WIN_SCORE, isFinalRound, matchWinner, newMatch, nextRound, resolveShot } from './rules';
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

describe('start', () => {
  it('puts player 1 at the near end and player 2 at the far end', () => {
    const s = newMatch();
    expect(s.pens[0].x).toBeGreaterThan(DESK.width / 2);
    expect(s.pens[1].x).toBeLessThan(DESK.width / 2);
  });
});

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

  it('calls it a draw when both pens fall, with no point to anyone', () => {
    const s = resolveShot(withOut(newMatch(), [true, true]), 0);
    expect(s.roundWinner).toBeNull();
    expect(s.roundReason).toBe('draw');
    expect(s.scores).toEqual([0, 0]);
    expect(s.phase).toBe('roundOver');
  });
});

describe('best of three', () => {
  it('two straight wins take the match: no third round', () => {
    let s = resolveShot(withOut(newMatch(), [false, true]), 0);
    s = nextRound(s);
    s = resolveShot(withOut({ ...s, turn: 0 }, [false, true]), 0);
    expect(s.scores).toEqual([WIN_SCORE, 0]);
    expect(s.phase).toBe('matchOver');
    expect(matchWinner(s)).toBe(0);
  });

  it('one win each makes the next round the final round', () => {
    let s = resolveShot(withOut(newMatch(), [false, true]), 0);
    s = nextRound(s);
    s = resolveShot(withOut(s, [true, false]), 1);
    expect(s.scores).toEqual([1, 1]);
    expect(s.phase).toBe('roundOver');
    expect(isFinalRound(nextRound(s))).toBe(true);
  });

  it('after a draw the other player starts the next round', () => {
    const drawn = resolveShot(withOut(newMatch(), [true, true]), 0);
    const s = nextRound(drawn);
    expect(s.round).toBe(2);
    expect(s.turn).toBe(1);
    expect(s.pens.every((p) => !p.out)).toBe(true);
  });

  it('the round loser shoots first in the next round', () => {
    const won = resolveShot(withOut(newMatch(), [false, true]), 0);
    expect(nextRound(won).turn).toBe(1);
  });
});
