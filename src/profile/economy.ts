import { PEN_MODELS, penModel, type PenModelId } from '../game/pens';
import { power as powerOf, type PowerId } from '../game/powers';
import type { Room } from '../game/rooms';

/** A pen in a player's pencil box, maybe with a hero power applied. */
export interface OwnedPen {
  uid: string;
  model: PenModelId;
  power: PowerId | null;
}

export interface Profile {
  id: string;
  name: string;
  rupees: number;
  pens: OwnedPen[];
  /** Day (YYYY-MM-DD) pocket money was last given. */
  lastPocketMoney: string | null;
  createdAt: string;
}

export const START_RUPEES = 100;
export const START_PENS = 3;
/** A pencil box holds at most this many pens. */
export const MAX_PENS = 5;
/** Below this a player can't afford the cheapest room, so pocket money tops them up. */
export const BROKE_BELOW = 25;
export const POCKET_MONEY = 50;

export type Rng = () => number;

const newUid = (rng: Rng) => `p${Date.now().toString(36)}${Math.floor(rng() * 1e9).toString(36)}`;

export function ownPen(model: PenModelId, rng: Rng = Math.random, power: PowerId | null = null): OwnedPen {
  return { uid: newUid(rng), model, power };
}

const sameSet = (a: PenModelId[], b: PenModelId[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();

/** Two level-1 pens and one level-2 pen, drawn at random. */
function drawStarterSet(rng: Rng): PenModelId[] {
  const pick = (level: number, n: number) => {
    const pool = PEN_MODELS.filter((m) => m.level === level).map((m) => m.id);
    const out: PenModelId[] = [];
    while (out.length < n) {
      const id = pool[Math.floor(rng() * pool.length)];
      if (!out.includes(id)) out.push(id);
    }
    return out;
  };
  return [...pick(1, 2), ...pick(2, 1)];
}

/**
 * A new player: ₹100 and three random pens. `avoid` lists other players'
 * collections; the new one never starts with exactly the same pens.
 */
export function newProfile(name: string, rng: Rng = Math.random, avoid: PenModelId[][] = []): Profile {
  let set = drawStarterSet(rng);
  for (let i = 0; i < 50 && avoid.some((other) => sameSet(other, set)); i++) set = drawStarterSet(rng);
  return {
    id: newUid(rng),
    name: name.trim() || 'Player',
    rupees: START_RUPEES,
    pens: set.map((m) => ownPen(m, rng)),
    lastPocketMoney: null,
    createdAt: new Date().toISOString(),
  };
}

export const today = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * Once a day, a broke player is topped up to ₹50 and a player with no pens gets
 * a free starter pen. Returns the profile unchanged when nothing is due.
 */
export function pocketMoney(p: Profile, day: string, rng: Rng = Math.random): { profile: Profile; rupees: number; pen: OwnedPen | null } {
  const broke = p.rupees < BROKE_BELOW;
  const empty = p.pens.length === 0;
  if (p.lastPocketMoney === day || (!broke && !empty)) return { profile: p, rupees: 0, pen: null };
  const rupees = broke ? POCKET_MONEY - p.rupees : 0;
  const starters = PEN_MODELS.filter((m) => m.level === 1);
  const pen = empty ? ownPen(starters[Math.floor(rng() * starters.length)].id, rng) : null;
  return {
    profile: { ...p, rupees: p.rupees + rupees, pens: pen ? [pen] : p.pens, lastPocketMoney: day },
    rupees,
    pen,
  };
}

export const penLevel = (pen: OwnedPen) => penModel(pen.model).level;

/** Pens allowed in a room. */
export function eligiblePens(p: Profile, room: Room): OwnedPen[] {
  return p.pens.filter((pen) => penLevel(pen) >= room.minLevel);
}

/** Why a player can't enter a room, or null if they can. */
export function entryProblem(p: Profile, room: Room): string | null {
  if (p.rupees < room.bet) return `You need ₹${room.bet} to enter. You have ₹${p.rupees}.`;
  if (eligiblePens(p, room).length === 0) return `Needs a level ${room.minLevel}+ pen. Buy one in the store.`;
  return null;
}

export class StoreError extends Error {}

export function buyPen(p: Profile, model: PenModelId, rng: Rng = Math.random): Profile {
  const m = penModel(model);
  if (p.pens.length >= MAX_PENS) throw new StoreError(`Your pencil box is full (${MAX_PENS} pens).`);
  if (p.rupees < m.price) throw new StoreError(`${m.name} costs ₹${m.price}. You have ₹${p.rupees}.`);
  return { ...p, rupees: p.rupees - m.price, pens: [...p.pens, ownPen(model, rng)] };
}

/** Applies a power to one pen, replacing any power it had. */
export function buyPower(p: Profile, power: PowerId, penUid: string): Profile {
  const pw = powerOf(power);
  if (!p.pens.some((pen) => pen.uid === penUid)) throw new StoreError('Pick one of your pens for the power.');
  if (p.rupees < pw.price) throw new StoreError(`${pw.name} costs ₹${pw.price}. You have ₹${p.rupees}.`);
  return {
    ...p,
    rupees: p.rupees - pw.price,
    pens: p.pens.map((pen) => (pen.uid === penUid ? { ...pen, power } : pen)),
  };
}

/** What a winner whose pencil box is full does with the pen they won. */
export type PrizeChoice = { kind: 'swap'; dropUid: string } | { kind: 'break' } | { kind: 'return' };

export const hasRoom = (p: Profile) => p.pens.length < MAX_PENS;

/** The winner's side of a bet: the loser's bet, and the loser's pen unless broken or given back. */
export function applyWin(p: Profile, bet: number, prize: OwnedPen, choice: PrizeChoice | null): Profile {
  const rupees = p.rupees + bet;
  if (choice === null) {
    if (!hasRoom(p)) throw new StoreError('Pencil box full: choose what to do with the prize pen.');
    return { ...p, rupees, pens: [...p.pens, prize] };
  }
  if (choice.kind === 'swap') {
    return { ...p, rupees, pens: [...p.pens.filter((pen) => pen.uid !== choice.dropUid), prize] };
  }
  return { ...p, rupees };
}

/** The loser's side: the bet is gone, and so is the pen, unless the winner gave it back. */
export function applyLoss(p: Profile, bet: number, penUid: string, returned: boolean): Profile {
  return {
    ...p,
    rupees: Math.max(0, p.rupees - bet),
    pens: returned ? p.pens : p.pens.filter((pen) => pen.uid !== penUid),
  };
}
