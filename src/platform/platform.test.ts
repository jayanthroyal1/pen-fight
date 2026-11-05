import { describe, expect, it } from 'vitest';
import { GENRES, gamesIn } from './catalog';
import { openingRoute, parseRoute, routeHash } from './routes';

describe('the catalog', () => {
  it('has the six genres', () => {
    expect(GENRES.map((g) => g.name)).toEqual(['Action', 'Adventure', 'Office', 'Simulation', 'Puzzle', 'Online']);
  });

  it('shows Pen Fight under both Action and Online, and nowhere else', () => {
    const withPenFight = GENRES.filter((g) => gamesIn(g.id).some((game) => game.id === 'pen-fight')).map((g) => g.id);
    expect(withPenFight).toEqual(['action', 'online']);
  });
});

describe('routes', () => {
  it('round-trips every route through the address hash', () => {
    for (const route of [{ kind: 'home' }, { kind: 'genre', id: 'puzzle' }, { kind: 'play', id: 'pen-fight' }] as const) {
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
    expect(openingRoute('', '#/genre/online')).toEqual({ kind: 'genre', id: 'online' });
  });
});
