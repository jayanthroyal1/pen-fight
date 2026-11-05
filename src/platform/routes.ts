import { isGameId, isGenreId, type GameId, type GenreId } from './catalog';

/** Where the player is. Kept in the address hash, so a phone's back button works. */
export type Route = { kind: 'home' } | { kind: 'genre'; id: GenreId } | { kind: 'play'; id: GameId };

export function parseRoute(hash: string): Route {
  const [, section, id] = hash.replace(/^#/, '').split('/');
  if (section === 'genre' && id && isGenreId(id)) return { kind: 'genre', id };
  if (section === 'play' && id && isGameId(id)) return { kind: 'play', id };
  return { kind: 'home' };
}

export function routeHash(route: Route): string {
  return route.kind === 'home' ? '#/' : `#/${route.kind}/${route.id}`;
}

/** The route a page opens on: an invite link goes straight into the game. */
export function openingRoute(search: string, hash: string): Route {
  const params = new URLSearchParams(search);
  if (params.has('room')) return { kind: 'play', id: 'pen-fight' };
  if (params.has('draw')) return { kind: 'play', id: 'doodle-rush' };
  return parseRoute(hash);
}
