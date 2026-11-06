import type { Movie } from './movies';

/** Movies in a level. */
export const ROUNDS = 10;
export const POINTS = 100;
/** What a right answer is worth after using the clue. */
export const POINTS_WITH_CLUE = 50;
/** The most a quick answer adds on a timed level. */
const SPEED_BONUS = 50;
/** Added for each answer in a row, up to the cap. */
const STREAK_BONUS = 10;
const STREAK_CAP = 5;
/** Wrong answers a player can give before the level ends. */
export const LIVES = 4;
/** Right answers for one, two and three stars. One star opens the next level. */
const STARS_AT = [6, 8, 10];

export interface Level {
  id: number;
  name: string;
  tagline: string;
  /** Seconds to answer; none means no clock. */
  seconds: number | null;
  /** Seconds between pictures appearing; none means all at once. */
  revealEvery: number | null;
  clue: boolean;
  choices: number;
  /** Ids of its movies. No movie is in two levels. */
  movies: string[];
}

/** Each level has less known films than the last, and asks for them with less time and less help. */
export const LEVELS: Level[] = [
  {
    id: 1,
    name: 'Opening Show',
    tagline: 'The biggest films. No clock.',
    seconds: null,
    revealEvery: null,
    clue: true,
    choices: 4,
    movies: ['baahubali', 'rrr', 'pushpa', 'eega', 'magadheera', 'kalki', 'hanu-man', 'arjun-reddy', 'rangasthalam', 'jersey'],
  },
  {
    id: 2,
    name: 'Housefull',
    tagline: 'The clock starts: 30 seconds.',
    seconds: 30,
    revealEvery: null,
    clue: true,
    choices: 4,
    movies: ['baahubali-2', 'pushpa-2', 'sita-ramam', 'ala-vaikunthapurramuloo', 'srimanthudu', 'salaar', 'devara', 'mahanati', 'pokiri', 'guntur-kaaram'],
  },
  {
    id: 3,
    name: 'Mass Hits',
    tagline: 'Older favourites in 24 seconds.',
    seconds: 24,
    revealEvery: null,
    clue: true,
    choices: 4,
    movies: ['gabbar-singh', 'dookudu', 'attarintiki-daredi', 'race-gurram', 'bommarillu', 'happy-days', 'athadu', 'chatrapathi', 'yamadonga', 'arundhati'],
  },
  {
    id: 4,
    name: 'Hidden Frames',
    tagline: 'Pictures appear one at a time.',
    seconds: 22,
    revealEvery: 4,
    clue: true,
    choices: 4,
    movies: ['fidaa', 'geetha-govindam', 'jathi-ratnalu', 'hi-nanna', 'dasara', 'uppena', 'akhanda', 'temper', 'janatha-garage', 'nannaku-prematho'],
  },
  {
    id: 5,
    name: 'Film Buff',
    tagline: 'Six titles to choose from.',
    seconds: 20,
    revealEvery: 3,
    clue: true,
    choices: 6,
    movies: ['manam', 'drushyam', 'maharshi', 'businessman', 'maryada-ramanna', 'karthikeya-2', 'bimbisara', 'major', 'sye-raa', 'dj-tillu'],
  },
  {
    id: 6,
    name: 'Director’s Cut',
    tagline: 'No clues. 16 seconds. Good luck.',
    seconds: 16,
    revealEvery: 3,
    clue: false,
    choices: 6,
    movies: ['balagam', 'pelli-choopulu', 'ee-nagaraniki-emaindi', 'baby', 'lucky-baskhar', 'court', 'care-of-kancharapalem', 'goodachari', 'kshanam', 'agent-sai-srinivasa-athreya'],
  },
];

/** Shown on the map, not yet playable. */
export const UPCOMING = [7, 8, 9, 10];

export interface Round {
  movie: Movie;
  /** The answers offered: the movie and wrong ones, shuffled. */
  choices: Movie[];
}

type Rng = () => number;

function shuffled<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A level's ten movies in a new order, each with wrong answers from the same level so they all look likely. */
export function newLevel(level: Level, movies: Movie[], rng: Rng = Math.random): Round[] {
  const own = level.movies.map((id) => movies.find((m) => m.id === id)).filter((m): m is Movie => !!m);
  return shuffled(own, rng).map((movie) => {
    const wrong = shuffled(
      own.filter((m) => m.id !== movie.id),
      rng,
    ).slice(0, level.choices - 1);
    return { movie, choices: shuffled([movie, ...wrong], rng) };
  });
}

/** Points for an answer: `timeLeft` is the share of the clock left, `streak` the right answers in a row including this one. */
export function pointsFor(right: boolean, usedClue: boolean, timeLeft = 0, streak = 0): number {
  if (!right) return 0;
  const base = usedClue ? POINTS_WITH_CLUE : POINTS;
  const inARow = streak >= 2 ? Math.min(streak, STREAK_CAP) * STREAK_BONUS : 0;
  return base + Math.round(SPEED_BONUS * timeLeft) + inARow;
}

export const starsFor = (rightAnswers: number) => STARS_AT.filter((at) => rightAnswers >= at).length;

export type Progress = Record<number, { stars: number; best: number }>;

/** Level 1 is always open; every other level needs a star on the one before it. */
export const isOpen = (progress: Progress, id: number) => id === 1 || (progress[id - 1]?.stars ?? 0) > 0;

export const totalStars = (progress: Progress) => Object.values(progress).reduce((sum, p) => sum + p.stars, 0);

/** The player's title, from all the stars they've won. */
export function rankFor(stars: number): string {
  if (stars >= 16) return 'Director';
  if (stars >= 12) return 'Critic';
  if (stars >= 7) return 'Film Fan';
  if (stars >= 3) return 'Regular';
  return 'Ticket Holder';
}

/** Each one works once per level. */
export type Lifeline = 'half' | 'time' | 'reveal';

/** How much time the clock lifeline buys. */
export const EXTRA_SECONDS = 10;

/** Which lifelines make sense on a level: there's no point adding time with no clock. */
export const lifelinesFor = (level: Level): Lifeline[] => [
  'half',
  ...(level.seconds !== null ? (['time'] as const) : []),
  ...(level.revealEvery !== null ? (['reveal'] as const) : []),
];

/** The wrong answers 50:50 takes away: half of them, leaving the right one and at least one other. */
export function halfOf(round: Round, rng: Rng = Math.random): string[] {
  const wrong = shuffled(
    round.choices.filter((c) => c.id !== round.movie.id),
    rng,
  );
  return wrong.slice(0, Math.ceil(wrong.length / 2) + (round.choices.length > 4 ? 1 : 0)).map((c) => c.id);
}

/** A seeded generator, so everyone gets the same movie on the same day. */
function seededBy(text: string): Rng {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = (Math.imul(h, 1664525) + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

export const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Today's Movie of the Day: the same for every player. */
export function dailyRound(day: string, movies: Movie[]): Round {
  const rng = seededBy(day);
  const list = shuffled(movies, rng);
  const movie = list[0];
  return { movie, choices: shuffled(list.slice(0, 4), rng) };
}

export interface Daily {
  /** The last day played, and how many in a row. */
  day: string;
  streak: number;
  right: boolean;
}

/** What the record says after playing on `day`. Missing a day starts the run again. */
export function afterDaily(was: Daily | null, day: string, right: boolean): Daily {
  if (was?.day === day) return was;
  const yesterday = new Date(`${day}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const continues = was?.day === dayKey(yesterday);
  return { day, right, streak: continues ? was.streak + 1 : 1 };
}
