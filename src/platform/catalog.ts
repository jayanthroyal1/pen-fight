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
  { id: 'action', name: 'Action', tagline: 'Fast hands, big hits.', color: '#ff4a26' },
  { id: 'adventure', name: 'Adventure', tagline: 'Go somewhere you’ve never been.', color: '#57c84d' },
  { id: 'office', name: 'Office', tagline: 'Desk chaos for your coffee break.', color: '#ffc21a' },
  { id: 'simulation', name: 'Simulation', tagline: 'Build it, run it, break it.', color: '#2fb4e8' },
  { id: 'puzzle', name: 'Puzzle', tagline: 'Think twice, move once.', color: '#e84f9c' },
  { id: 'online', name: 'Online', tagline: 'Real players, real rivalries.', color: '#18c7b2' },
];

export type GameId = 'pen-fight' | 'guess-movie' | 'doodle-rush' | 'wolf-run' | 'sword-fight' | 'blade-rift';

export interface Game {
  id: GameId;
  title: string;
  tagline: string;
  /** Short facts shown on the game's card. */
  facts: string[];
  genres: GenreId[];
  /** Still being finished: its card says so. */
  beta?: boolean;
  /** A named section inside one genre's page, with a line about it. */
  shelf?: { genre: GenreId; name: string; tagline: string };
}

const FRIDAY_FUN = { genre: 'office', name: 'Friday Fun', tagline: 'Quick games to start the weekend.' } as const;

export const GAMES: Game[] = [
  {
    id: 'pen-fight',
    title: 'Pen Fight',
    tagline: 'Flick your pen, knock theirs off the desk, and win it.',
    facts: ['1–2 players', 'Online', 'Hero powers'],
    genres: ['action', 'online'],
  },
  {
    id: 'guess-movie',
    title: 'Guess the Movie Title',
    tagline: 'A few little pictures. Six levels. Name the movie.',
    facts: ['1 player', 'Telugu', '6 levels'],
    genres: ['office'],
    shelf: FRIDAY_FUN,
  },
  {
    id: 'doodle-rush',
    title: 'Doodle Rush',
    tagline: 'One player draws, everyone races to guess the word.',
    facts: ['2–8 players', 'Online rooms', 'Draw and guess'],
    genres: ['online', 'puzzle', 'office'],
    shelf: FRIDAY_FUN,
  },
  {
    id: 'wolf-run',
    title: 'Wolf Run',
    tagline: 'Jump the rocks, dodge the owls, and beat your best.',
    facts: ['1 player', 'One-tap controls', 'Endless'],
    genres: ['action'],
  },
  {
    id: 'sword-fight',
    title: 'Stick Man Sword Fight',
    tagline: 'They burned your home. Fight eight duels to the Throne of Ash.',
    facts: ['1 player', 'Story mode', 'Super powers'],
    genres: ['adventure'],
    beta: true,
  },
];

export const genre = (id: GenreId): Genre => GENRES.find((g) => g.id === id) ?? GENRES[0];

export const isGenreId = (v: string): v is GenreId => GENRES.some((g) => g.id === v);

/** Being built: reachable by its link, but not listed anywhere yet. */
const UNLISTED: GameId[] = ['blade-rift'];

export const isGameId = (v: string): v is GameId => GAMES.some((g) => g.id === v) || UNLISTED.includes(v as GameId);

export const gamesIn = (id: GenreId): Game[] => GAMES.filter((g) => g.genres.includes(id));

/** The platform's own colour, from the logo. */
export const BRAND_ORANGE = '#ff6a13';
