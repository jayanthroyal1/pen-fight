import type { Movie } from './movies';

/** Movies in one game. */
export const ROUNDS = 10;
export const CHOICES = 4;
export const POINTS = 100;
/** What a right answer is worth after using the clue. */
export const POINTS_WITH_CLUE = 50;

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

/** A game: different movies each round, each with wrong answers from the rest of the list. */
export function newGame(movies: Movie[], rng: Rng = Math.random): Round[] {
  return shuffled(movies, rng)
    .slice(0, ROUNDS)
    .map((movie) => {
      const wrong = shuffled(
        movies.filter((m) => m.id !== movie.id),
        rng,
      ).slice(0, CHOICES - 1);
      return { movie, choices: shuffled([movie, ...wrong], rng) };
    });
}

export const pointsFor = (right: boolean, usedClue: boolean) => (!right ? 0 : usedClue ? POINTS_WITH_CLUE : POINTS);
