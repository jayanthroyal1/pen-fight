import { boost as boostOf, type BoostId } from './boosts';
import { DESK, createPen } from './physics';
import type { GameState, Loadout, Pen, PlayerId } from './types';

/**
 * A match is best of three: two round wins take it. A draw (both pens off in
 * one shot) scores nothing, and the next round settles it. At 1–1 the next
 * round is the final round.
 */
export const WIN_SCORE = 2;

/**
 * Starting layout for a round: player 1's pen at the near end of the desk,
 * player 2's at the far end. Deterministic per round, so both players in an
 * online match set up the same desk.
 */
export function startPens(round: number, loadouts: [Loadout, Loadout]): [Pen, Pen] {
  const tilt = Math.sin(round * 1.7) * 0.25;
  const cy = DESK.height / 2;
  return [
    createPen(0, DESK.width * 0.72, cy, Math.PI / 2 - tilt, loadouts[0].model, loadouts[0].power),
    createPen(1, DESK.width * 0.28, cy, Math.PI / 2 + tilt, loadouts[1].model, loadouts[1].power),
  ];
}

/** Which end of the desk is each player's: +1 for the high-x end, -1 for the low. */
export const endOf = (p: PlayerId): 1 | -1 => (p === 0 ? 1 : -1);

const DEFAULT: [Loadout, Loadout] = [
  { model: 'click-red', power: null },
  { model: 'click-red', power: null },
];

/** Fresh super-power state for a round. */
const noBoosts = () => ({ armed: [], lives: [0, 0] as [number, number], boostThisTurn: null, saved: [] });

export function newMatch(loadouts: [Loadout, Loadout] = DEFAULT): GameState {
  return {
    loadouts,
    pens: startPens(1, loadouts),
    turn: 0,
    starter: 0,
    scores: [0, 0],
    round: 1,
    phase: 'aim',
    roundWinner: null,
    roundReason: null,
    ...noBoosts(),
  };
}

export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

/** The deciding round: both players one win from the match. */
export const isFinalRound = (s: GameState) => s.scores[0] === WIN_SCORE - 1 && s.scores[1] === WIN_SCORE - 1;

/** Why `player` can't arm `id` right now, or null if they can. */
export function boostProblem(state: GameState, player: PlayerId, id: BoostId): string | null {
  if (state.phase !== 'aim' || state.turn !== player) return 'Super powers are armed on your own turn.';
  if (state.boostThisTurn && state.boostThisTurn !== id) return 'One super power a turn.';
  if (id === 'health' && state.lives[player] > 0 && state.boostThisTurn !== 'health') return 'Your pen already has a spare life.';
  if (state.armed.some((a) => a.by === player && a.id === id && state.boostThisTurn !== id)) return `${boostOf(id).name} is already waiting.`;
  return null;
}

/** Arms a super power for the player on turn. Returns the state unchanged if it can't be. */
export function armBoost(state: GameState, player: PlayerId, id: BoostId): GameState {
  if (boostProblem(state, player, id) || state.boostThisTurn === id) return state;
  const b = boostOf(id);
  if (b.timing === 'round') {
    const lives: [number, number] = [...state.lives];
    lives[player] = 1;
    return { ...state, lives, boostThisTurn: id };
  }
  const target = b.timing === 'mine' ? player : other(player);
  return { ...state, armed: [...state.armed, { id, by: player, target }], boostThisTurn: id };
}

/** Takes back the super power armed this turn, before the flick. */
export function disarmBoost(state: GameState, player: PlayerId): GameState {
  const id = state.boostThisTurn;
  if (!id || state.turn !== player || state.phase !== 'aim') return state;
  if (boostOf(id).timing === 'round') {
    const lives: [number, number] = [...state.lives];
    lives[player] = 0;
    return { ...state, lives, boostThisTurn: null };
  }
  // The one armed this turn is the last one added.
  let i = state.armed.length - 1;
  while (i >= 0 && !(state.armed[i].by === player && state.armed[i].id === id)) i--;
  return { ...state, armed: state.armed.filter((_, j) => j !== i), boostThisTurn: null };
}

/** How super powers change one shot by `shooter`; read by the physics world. */
export interface ShotMods {
  /** Flick strength multiplier. */
  strike: number;
  lightning: boolean;
  /** The desk is ice. */
  ice: boolean;
  /** Sideways gravity along desk x, as a share of gravity (Uneven Desk). */
  tilt: number;
  /** Whose half of the desk has walls round it. */
  wall: PlayerId | null;
  /** Whose pen grips the desk. */
  grip: PlayerId | null;
}

export const PLAIN_SHOT: ShotMods = { strike: 1, lightning: false, ice: false, tilt: 0, wall: null, grip: null };

/** Share of gravity that pulls sideways on an Uneven Desk: about a 7° slope. */
export const TILT = 0.12;
export const STRIKE = 1.5;

export function shotMods(state: GameState, shooter: PlayerId): ShotMods {
  const mods = { ...PLAIN_SHOT };
  for (const a of state.armed) {
    if (a.target !== shooter) continue;
    if (a.id === 'strike') mods.strike = STRIKE;
    else if (a.id === 'lightning') mods.lightning = true;
    else if (a.id === 'ice') mods.ice = true;
    // Downhill towards the shooter's own end.
    else if (a.id === 'tilt') mods.tilt = TILT * endOf(shooter);
    else if (a.id === 'wall') mods.wall = a.by;
    else if (a.id === 'grip') mods.grip = a.by;
  }
  return mods;
}

/** Puts a saved pen back where it started the round, clear of the other pen. */
function revive(state: GameState, p: PlayerId): Pen {
  const start = startPens(state.round, state.loadouts)[p];
  const rival = state.pens[other(p)];
  const near = !rival.out && Math.hypot(rival.x - start.x, rival.y - start.y) < 70;
  return near ? { ...start, y: start.y + (rival.y > start.y ? -110 : 110) } : start;
}

/** Decides what happens once a shot by `shooter` has come to rest. */
export function resolveShot(state: GameState, shooter: PlayerId): GameState {
  const opponent = other(shooter);
  const again = state.armed.some((a) => a.target === shooter && a.id === 'double');
  // This shot's super powers are used up; the next player starts their turn fresh.
  const lives: [number, number] = [...state.lives];
  const pens: [Pen, Pen] = [...state.pens];
  const saved: PlayerId[] = [];
  for (const p of [0, 1] as const) {
    if (pens[p].out && lives[p] > 0) {
      lives[p] -= 1;
      pens[p] = revive(state, p);
      saved.push(p);
    }
  }
  const after: GameState = {
    ...state,
    pens,
    lives,
    saved,
    armed: state.armed.filter((a) => a.target !== shooter),
    boostThisTurn: null,
  };
  const shooterOut = pens[shooter].out;
  const opponentOut = pens[opponent].out;

  if (shooterOut && opponentOut) {
    return { ...after, phase: 'roundOver', roundWinner: null, roundReason: 'draw' };
  }
  const winner = shooterOut ? opponent : opponentOut ? shooter : null;
  if (winner === null) return { ...after, turn: again ? shooter : opponent, phase: 'aim' };

  const scores: [number, number] = [...state.scores];
  scores[winner] += 1;
  return {
    ...after,
    scores,
    phase: scores[winner] >= WIN_SCORE ? 'matchOver' : 'roundOver',
    roundWinner: winner,
    roundReason: winner === shooter ? 'knocked' : 'fell',
  };
}

/** Sets up the next round: the round's loser shoots first, or after a draw the other player. */
export function nextRound(state: GameState): GameState {
  const round = state.round + 1;
  const starter = state.roundWinner === null ? other(state.starter) : other(state.roundWinner);
  return {
    ...state,
    pens: startPens(round, state.loadouts),
    round,
    turn: starter,
    starter,
    phase: 'aim',
    roundWinner: null,
    roundReason: null,
    ...noBoosts(),
  };
}

/** The match winner, once the match is over. */
export function matchWinner(state: GameState): PlayerId | null {
  if (state.phase !== 'matchOver') return null;
  return state.scores[0] >= WIN_SCORE ? 0 : state.scores[1] >= WIN_SCORE ? 1 : null;
}
