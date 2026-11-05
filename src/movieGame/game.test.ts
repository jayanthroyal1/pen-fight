import { describe, expect, it } from 'vitest';
import { CHOICES, POINTS, POINTS_WITH_CLUE, ROUNDS, newGame, pointsFor } from './game';
import { LANGUAGES, TELUGU_MOVIES } from './movies';

const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

describe('the movie list', () => {
  it('has only Telugu ready for now', () => {
    expect(LANGUAGES.map((l) => l.name)).toEqual(['Telugu', 'Hindi', 'Tamil', 'English']);
    expect(LANGUAGES.filter((l) => l.ready).map((l) => l.id)).toEqual(['telugu']);
  });

  it('gives every movie at least three pictures, and never the title in its clue', () => {
    for (const m of TELUGU_MOVIES) {
      expect(m.items.length, m.id).toBeGreaterThanOrEqual(3);
      expect(squash(m.clue), m.id).not.toContain(squash(m.title.split(':')[0]));
      expect(m.local).toBeTruthy();
    }
  });

  it('never uses the same pictures for two movies', () => {
    const sets = TELUGU_MOVIES.map((m) => [...m.items].sort().join(''));
    expect(new Set(sets).size).toBe(sets.length);
  });

  it('has no repeated movies', () => {
    expect(new Set(TELUGU_MOVIES.map((m) => m.id)).size).toBe(TELUGU_MOVIES.length);
  });
});

describe('a game', () => {
  it('asks ten different movies, each with four different answers including the right one', () => {
    const rounds = newGame(TELUGU_MOVIES, seeded(11));
    expect(rounds).toHaveLength(ROUNDS);
    expect(new Set(rounds.map((r) => r.movie.id)).size).toBe(ROUNDS);
    for (const r of rounds) {
      expect(new Set(r.choices.map((c) => c.id)).size).toBe(CHOICES);
      expect(r.choices.map((c) => c.id)).toContain(r.movie.id);
    }
  });

  it('moves the right answer around', () => {
    const spots = new Set(newGame(TELUGU_MOVIES, seeded(5)).map((r) => r.choices.indexOf(r.movie)));
    expect(spots.size).toBeGreaterThan(1);
  });

  it('scores less after a clue, and nothing for a wrong answer', () => {
    expect(pointsFor(true, false)).toBe(POINTS);
    expect(pointsFor(true, true)).toBe(POINTS_WITH_CLUE);
    expect(pointsFor(false, true)).toBe(0);
  });
});
