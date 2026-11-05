import { describe, expect, it } from 'vitest';
import { GENRES, gamesIn } from './catalog';
import { isIosDevice } from './fullscreen';
import { openingRoute, parseRoute, routeHash } from './routes';

describe('the catalog', () => {
  it('has the six genres', () => {
    expect(GENRES.map((g) => g.name)).toEqual(['Action', 'Adventure', 'Office', 'Simulation', 'Puzzle', 'Online']);
  });

  it('shows Guess the Movie Title on the Friday Fun shelf under Office', () => {
    const [game] = gamesIn('office');
    expect(game.title).toBe('Guess the Movie Title');
    expect(game.shelf?.name).toBe('Friday Fun');
  });

  it('shows Wolf Run under Action', () => {
    expect(gamesIn('action').map((g) => g.title)).toEqual(['Pen Fight', 'Wolf Run']);
  });

  it('shows Doodle Rush under Online, Puzzle and Office', () => {
    const genres = GENRES.filter((g) => gamesIn(g.id).some((game) => game.id === 'doodle-rush')).map((g) => g.id);
    expect(genres).toEqual(['office', 'puzzle', 'online']);
  });

  it('shows Pen Fight under both Action and Online, and nowhere else', () => {
    const withPenFight = GENRES.filter((g) => gamesIn(g.id).some((game) => game.id === 'pen-fight')).map((g) => g.id);
    expect(withPenFight).toEqual(['action', 'online']);
  });
});

describe('routes', () => {
  it('round-trips every route through the address hash', () => {
    for (const route of [{ kind: 'home' }, { kind: 'genre', id: 'office' }, { kind: 'play', id: 'guess-movie' }] as const) {
      expect(parseRoute(routeHash(route))).toEqual(route);
    }
  });

  it('falls back to home for anything it does not know', () => {
    for (const hash of ['', '#', '#/', '#/genre/racing', '#/play/chess', '#/nope']) {
      expect(parseRoute(hash)).toEqual({ kind: 'home' });
    }
  });

  it('sends an invite link straight into the game', () => {
    expect(openingRoute('?room=ABCD&bet=public', '')).toEqual({ kind: 'play', id: 'pen-fight' });
    expect(openingRoute('?draw=WXYZ', '')).toEqual({ kind: 'play', id: 'doodle-rush' });
    expect(openingRoute('', '#/genre/online')).toEqual({ kind: 'genre', id: 'online' });
  });
});

describe('spotting iPhones and iPads', () => {
  it('knows them from the rest, even an iPad calling itself a Mac', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)', 'iPhone', 5)).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Macintosh)', 'MacIntel', 5)).toBe(true);
    expect(isIosDevice('Mozilla/5.0 (Macintosh)', 'MacIntel', 0)).toBe(false);
    expect(isIosDevice('Mozilla/5.0 (Linux; Android 14)', 'Linux armv8l', 5)).toBe(false);
  });
});
