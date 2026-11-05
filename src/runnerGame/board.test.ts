import { describe, expect, it } from 'vitest';
import { parseBoard } from './board';

describe('reading the leaderboard', () => {
  it('reads a board, best score first', () => {
    const b = parseBoard({
      top: [
        { name: 'Bala', score: 900, me: false },
        { name: 'Asha', score: 1400, me: true },
      ],
      rank: 1,
      players: 2,
    });
    expect(b?.top.map((r) => r.name)).toEqual(['Asha', 'Bala']);
    expect(b?.top[0].me).toBe(true);
    expect(b?.rank).toBe(1);
  });

  it('copes with a player who has no score yet', () => {
    expect(parseBoard({ top: [], rank: null, players: 0 })).toEqual({ top: [], rank: null, players: 0 });
  });

  it('refuses anything that is not a board', () => {
    for (const bad of [null, {}, { top: 'x' }, 'error']) expect(parseBoard(bad)).toBeNull();
  });

  it('cleans up odd rows instead of breaking', () => {
    const b = parseBoard({ top: [{ name: 'A very long name indeed, far too long', score: 'x' }], rank: 'no' });
    expect(b?.top[0].name).toHaveLength(16);
    expect(b?.top[0].score).toBe(0);
    expect(b?.rank).toBeNull();
  });
});
