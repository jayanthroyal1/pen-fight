import { describe, expect, it } from 'vitest';
import { EXTRA_SECONDS, LEVELS, LIVES, POINTS, afterDaily, dailyRound, dayKey, halfOf, lifelinesFor, POINTS_WITH_CLUE, ROUNDS, UPCOMING, isOpen, newLevel, pointsFor, rankFor, starsFor, totalStars } from './game';
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

describe('the levels', () => {
  const ids = LEVELS.flatMap((l) => l.movies);

  it('has six levels of ten movies, with no movie used twice', () => {
    expect(LEVELS).toHaveLength(6);
    for (const l of LEVELS) expect(l.movies, l.name).toHaveLength(ROUNDS);
    expect(new Set(ids).size).toBe(60);
  });

  it('uses every movie in the list, all from 2005 to 2026', () => {
    expect([...ids].sort()).toEqual(TELUGU_MOVIES.map((m) => m.id).sort());
    for (const m of TELUGU_MOVIES) {
      expect(m.year, m.id).toBeGreaterThanOrEqual(2005);
      expect(m.year, m.id).toBeLessThanOrEqual(2026);
    }
  });

  it('gets harder every level', () => {
    const clock = LEVELS.map((l) => l.seconds ?? Infinity);
    for (let i = 1; i < clock.length; i++) {
      expect(clock[i]).toBeLessThan(clock[i - 1]);
      expect(LEVELS[i].choices).toBeGreaterThanOrEqual(LEVELS[i - 1].choices);
    }
    expect(LEVELS[5].clue).toBe(false);
  });

  it('lists levels 7 to 10 as upcoming', () => {
    expect(UPCOMING).toEqual([7, 8, 9, 10]);
  });
});

describe('a level', () => {
  it('asks its ten movies once each, with the right number of different answers', () => {
    for (const level of LEVELS) {
      const rounds = newLevel(level, TELUGU_MOVIES, seeded(11));
      expect(rounds.map((r) => r.movie.id).sort()).toEqual([...level.movies].sort());
      for (const r of rounds) {
        expect(new Set(r.choices.map((c) => c.id)).size).toBe(level.choices);
        expect(r.choices.map((c) => c.id)).toContain(r.movie.id);
        for (const c of r.choices) expect(level.movies).toContain(c.id);
      }
    }
  });

  it('moves the right answer around', () => {
    const spots = new Set(newLevel(LEVELS[0], TELUGU_MOVIES, seeded(5)).map((r) => r.choices.indexOf(r.movie)));
    expect(spots.size).toBeGreaterThan(1);
  });

  it('scores less after a clue, more for speed and streaks, and nothing for a wrong answer', () => {
    expect(pointsFor(true, false)).toBe(POINTS);
    expect(pointsFor(true, true)).toBe(POINTS_WITH_CLUE);
    expect(pointsFor(false, true, 1, 5)).toBe(0);
    expect(pointsFor(true, false, 1)).toBe(POINTS + 50);
    expect(pointsFor(true, false, 0, 1)).toBe(POINTS);
    expect(pointsFor(true, false, 0, 3)).toBe(POINTS + 30);
    expect(pointsFor(true, false, 0, 9)).toBe(POINTS + 50);
  });

  it('gives stars for right answers, and opens a level after a star on the one before', () => {
    expect([5, 6, 8, 10].map(starsFor)).toEqual([0, 1, 2, 3]);
    expect(isOpen({}, 1)).toBe(true);
    expect(isOpen({}, 2)).toBe(false);
    expect(isOpen({ 1: { stars: 0, best: 300 } }, 2)).toBe(false);
    expect(isOpen({ 1: { stars: 1, best: 700 } }, 2)).toBe(true);
    expect(LIVES + 6).toBe(ROUNDS);
  });

  it('promotes the player as the stars add up', () => {
    expect(totalStars({ 1: { stars: 3, best: 1 }, 2: { stars: 2, best: 1 } })).toBe(5);
    expect([0, 3, 7, 12, 16].map(rankFor)).toEqual(['Ticket Holder', 'Regular', 'Film Fan', 'Critic', 'Director']);
  });
});

describe('lifelines', () => {
  it('offers only what makes sense on a level', () => {
    expect(lifelinesFor(LEVELS[0])).toEqual(['half']);
    expect(lifelinesFor(LEVELS[1])).toEqual(['half', 'time']);
    expect(lifelinesFor(LEVELS[3])).toEqual(['half', 'time', 'reveal']);
    expect(EXTRA_SECONDS).toBeGreaterThan(0);
  });

  it('50:50 leaves the right answer and one other, on four or six choices', () => {
    for (const level of [LEVELS[0], LEVELS[5]]) {
      for (const round of newLevel(level, TELUGU_MOVIES, seeded(3))) {
        const gone = halfOf(round, seeded(9));
        expect(gone).not.toContain(round.movie.id);
        expect(round.choices.length - gone.length).toBe(level.choices === 4 ? 2 : 2);
      }
    }
  });
});

describe('Movie of the Day', () => {
  it('is the same for everyone on a day, and changes between days', () => {
    const a = dailyRound('2026-11-06', TELUGU_MOVIES);
    const b = dailyRound('2026-11-06', TELUGU_MOVIES);
    expect(a.movie.id).toBe(b.movie.id);
    expect(a.choices.map((c) => c.id)).toEqual(b.choices.map((c) => c.id));
    expect(a.choices).toHaveLength(4);
    expect(a.choices.map((c) => c.id)).toContain(a.movie.id);
    const days = Array.from({ length: 30 }, (_, i) => dailyRound(`2026-11-${String(i + 1).padStart(2, '0')}`, TELUGU_MOVIES).movie.id);
    expect(new Set(days).size).toBeGreaterThan(15);
  });

  it('counts days in a row, across a month end, and restarts after a gap', () => {
    const first = afterDaily(null, '2026-10-31', true);
    expect(first.streak).toBe(1);
    const next = afterDaily(first, '2026-11-01', false);
    expect(next.streak).toBe(2);
    expect(afterDaily(next, '2026-11-01', true)).toBe(next);
    expect(afterDaily(next, '2026-11-04', true).streak).toBe(1);
  });

  it('writes a date with its local day', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
