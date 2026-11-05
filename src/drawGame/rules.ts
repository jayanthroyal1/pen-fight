/**
 * Doodle Rush: one player draws a word, the others race to type it. Everyone
 * draws once a round. These rules run on the room's host; other players only
 * ever see `publicView`, which leaves the word out until the turn ends.
 */

export const ROUNDS = 3;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;
export const CHOOSE_MS = 15_000;
export const DRAW_MS = 80_000;
export const REVEAL_MS = 6_000;
/** Word choices the drawer is offered. */
export const CHOICES = 3;
/** Share of the turn gone when each hint letter appears. */
const HINTS_AT = [0.5, 0.75];

export interface Player {
  id: string;
  name: string;
  score: number;
}

export type Phase = 'lobby' | 'choosing' | 'drawing' | 'reveal' | 'over';

export interface Game {
  phase: Phase;
  players: Player[];
  round: number;
  /** Who draws, in order, this round. */
  order: string[];
  turn: number;
  drawerId: string | null;
  word: string | null;
  choices: string[];
  guessed: string[];
  /** Positions in the word shown as hints. */
  hints: number[];
  /** When this phase ends. */
  deadline: number;
  startedAt: number;
}

/** What every player's screen is told. */
export interface View {
  phase: Phase;
  players: Player[];
  round: number;
  rounds: number;
  drawerId: string | null;
  /** The word with hidden letters as `_`; the whole word once the turn is over. */
  mask: string;
  guessed: string[];
  /** Milliseconds left in this phase. */
  left: number;
  /** The word, once it can be told. */
  word: string | null;
}

type Rng = () => number;

export const newGame = (players: Player[] = []): Game => ({
  phase: 'lobby',
  players,
  round: 0,
  order: [],
  turn: 0,
  drawerId: null,
  word: null,
  choices: [],
  guessed: [],
  hints: [],
  deadline: 0,
  startedAt: 0,
});

function shuffled<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function beginTurn(g: Game, words: string[], now: number, rng: Rng): Game {
  return {
    ...g,
    phase: 'choosing',
    drawerId: g.order[g.turn],
    word: null,
    choices: shuffled(words, rng).slice(0, CHOICES),
    guessed: [],
    hints: [],
    deadline: now + CHOOSE_MS,
  };
}

export function startGame(g: Game, words: string[], now: number, rng: Rng = Math.random): Game {
  if (g.players.length < MIN_PLAYERS) return g;
  const players = g.players.map((p) => ({ ...p, score: 0 }));
  return beginTurn({ ...g, players, round: 1, turn: 0, order: shuffled(players.map((p) => p.id), rng) }, words, now, rng);
}

export function chooseWord(g: Game, word: string, now: number): Game {
  if (g.phase !== 'choosing' || !g.choices.includes(word)) return g;
  return { ...g, phase: 'drawing', word, startedAt: now, deadline: now + DRAW_MS };
}

const endTurn = (g: Game, now: number): Game => ({ ...g, phase: 'reveal', deadline: now + REVEAL_MS });

/** Lowercase letters and digits only, so "Auto-Rickshaw" matches "auto rickshaw". */
export const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Edit distance, stopping at 2: all that matters is right, one slip away, or neither. */
function oneSlip(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let slips = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++slips > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return slips + (a.length - i) + (b.length - j) <= 1;
}

export type GuessResult = 'right' | 'close' | 'wrong' | 'ignored';

/** Points for guessing with `share` (0..1) of the turn left, and how the drawer shares in it. */
export const guessPoints = (share: number, place: number) => Math.round(120 + 380 * share - place * 20);
const DRAWER_SHARE = 0.3;

export function guess(g: Game, playerId: string, text: string, now: number): { game: Game; result: GuessResult } {
  const answer = normalise(g.word ?? '');
  if (g.phase !== 'drawing' || playerId === g.drawerId || g.guessed.includes(playerId) || !answer) {
    return { game: g, result: 'ignored' };
  }
  const said = normalise(text);
  if (said !== answer) {
    return { game: g, result: answer.length >= 4 && oneSlip(said, answer) ? 'close' : 'wrong' };
  }
  const share = Math.max(0, (g.deadline - now) / DRAW_MS);
  const points = Math.max(40, guessPoints(share, g.guessed.length));
  const players = g.players.map((p) => {
    if (p.id === playerId) return { ...p, score: p.score + points };
    if (p.id === g.drawerId) return { ...p, score: p.score + Math.round(points * DRAWER_SHARE) };
    return p;
  });
  const guessed = [...g.guessed, playerId];
  const next = { ...g, players, guessed };
  const allIn = players.every((p) => p.id === g.drawerId || guessed.includes(p.id));
  return { game: allIn ? endTurn(next, now) : next, result: 'right' };
}

function nextTurn(g: Game, words: string[], now: number, rng: Rng): Game {
  const stillHere = (id: string) => g.players.some((p) => p.id === id);
  let turn = g.turn + 1;
  while (turn < g.order.length && !stillHere(g.order[turn])) turn++;
  if (turn < g.order.length) return beginTurn({ ...g, turn }, words, now, rng);
  if (g.round >= ROUNDS) return { ...g, phase: 'over', drawerId: null, deadline: now };
  return beginTurn({ ...g, round: g.round + 1, turn: 0, order: shuffled(g.players.map((p) => p.id), rng) }, words, now, rng);
}

/** Moves the game on with time: called often by the host. Returns the same game if nothing changed. */
export function tick(g: Game, words: string[], now: number, rng: Rng = Math.random): Game {
  if (g.phase === 'choosing' && now >= g.deadline) return chooseWord(g, g.choices[0], now);
  if (g.phase === 'reveal' && now >= g.deadline) return nextTurn(g, words, now, rng);
  if (g.phase !== 'drawing') return g;
  if (now >= g.deadline) return endTurn(g, now);
  const gone = 1 - (g.deadline - now) / DRAW_MS;
  const due = HINTS_AT.filter((at) => gone >= at).length;
  const word = g.word ?? '';
  const hidden = [...word].map((c, i) => (c !== ' ' && !g.hints.includes(i) ? i : -1)).filter((i) => i >= 0);
  if (g.hints.length < due && hidden.length > 2) {
    return { ...g, hints: [...g.hints, hidden[Math.floor(rng() * hidden.length)]] };
  }
  return g;
}

export function addPlayer(g: Game, player: Player): Game {
  if (g.players.some((p) => p.id === player.id) || g.players.length >= MAX_PLAYERS) return g;
  return { ...g, players: [...g.players, player], order: g.phase === 'lobby' ? g.order : [...g.order, player.id] };
}

export function removePlayer(g: Game, id: string, now: number): Game {
  if (!g.players.some((p) => p.id === id)) return g;
  const next = { ...g, players: g.players.filter((p) => p.id !== id) };
  if (g.phase === 'lobby' || g.phase === 'over') return next;
  if (next.players.length < MIN_PLAYERS) return { ...next, phase: 'over', drawerId: null, deadline: now };
  // The drawer left: this turn can't go on.
  if (id === g.drawerId && g.phase !== 'reveal') return endTurn(next, now);
  const allIn = g.phase === 'drawing' && next.players.every((p) => p.id === g.drawerId || g.guessed.includes(p.id));
  return allIn ? endTurn(next, now) : next;
}

/** Back to the lobby for another game, keeping everyone. */
export const backToLobby = (g: Game): Game => newGame(g.players.map((p) => ({ ...p, score: 0 })));

export function publicView(g: Game, now: number): View {
  const showWord = g.phase === 'reveal' || g.phase === 'over';
  const word = g.word ?? '';
  return {
    phase: g.phase,
    players: g.players,
    round: g.round,
    rounds: ROUNDS,
    drawerId: g.drawerId,
    mask: showWord ? word : [...word].map((c, i) => (c === ' ' || g.hints.includes(i) ? c : '_')).join(''),
    guessed: g.guessed,
    left: Math.max(0, g.deadline - now),
    word: showWord ? g.word : null,
  };
}

/** A new host picks the game up from the last view: the word is gone, so that turn ends. */
export function fromView(v: View, now: number): Game {
  const stillPlaying = v.phase !== 'lobby' && v.phase !== 'over';
  return {
    ...newGame(v.players),
    phase: stillPlaying ? 'reveal' : v.phase,
    round: v.round,
    order: v.players.map((p) => p.id),
    turn: v.players.length,
    drawerId: v.drawerId,
    word: v.word,
    deadline: now + 1500,
  };
}
