/** What's on the WildPlayers platform: genres to browse, and the games in them. */

export type GenreId = 'action' | 'adventure' | 'office' | 'simulation' | 'puzzle' | 'online';

export interface Genre {
  id: GenreId;
  name: string;
  /** One line for the genre's page. */
  tagline: string;
  /** The genre's colour: its tile, and the mood of the 3D background on its page. */
  color: string;
}

export const GENRES: Genre[] = [
  { id: 'action', name: 'Action', tagline: 'Fast hands, big hits.', color: '#ff5a1f' },
  { id: 'adventure', name: 'Adventure', tagline: 'Go somewhere you’ve never been.', color: '#2fbf8f' },
  { id: 'office', name: 'Office', tagline: 'Desk chaos for your coffee break.', color: '#4f8cff' },
  { id: 'simulation', name: 'Simulation', tagline: 'Build it, run it, break it.', color: '#b06bff' },
  { id: 'puzzle', name: 'Puzzle', tagline: 'Think twice, move once.', color: '#ffc233' },
  { id: 'online', name: 'Online', tagline: 'Real players, real rivalries.', color: '#19d3e6' },
];

export type GameId = 'pen-fight';

export interface Game {
  id: GameId;
  title: string;
  tagline: string;
  /** Short facts shown on the game's card. */
  facts: string[];
  genres: GenreId[];
}

export const GAMES: Game[] = [
  {
    id: 'pen-fight',
    title: 'Pen Fight',
    tagline: 'Flick your pen, knock theirs off the desk, and win it.',
    facts: ['1–2 players', 'Online', 'Hero powers'],
    genres: ['action', 'online'],
  },
];

export const genre = (id: GenreId): Genre => GENRES.find((g) => g.id === id) ?? GENRES[0];

export const isGenreId = (v: string): v is GenreId => GENRES.some((g) => g.id === v);

export const isGameId = (v: string): v is GameId => GAMES.some((g) => g.id === v);

export const gamesIn = (id: GenreId): Game[] => GAMES.filter((g) => g.genres.includes(id));

/** The platform's own colour, from the logo. */
export const BRAND_ORANGE = '#ff7a1a';
