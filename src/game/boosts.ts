/**
 * Super powers: one-use boosts, separate from the hero powers that live on a
 * pen. On your turn, before you flick, you can use one for your shot (Lightning,
 * Power Strike, Double Turn). While the other player aims, you can use one
 * against their shot: protect yourself (Force Wall, Super Grip) or get in their
 * way (Ice Desk, Uneven Desk). Health Boost, any time, saves your pen once if
 * it goes off the desk this round.
 */
export type BoostId = 'lightning' | 'health' | 'grip' | 'ice' | 'strike' | 'tilt' | 'wall' | 'double';

/** When a boost is used: on your own shot, against the opponent's shot, or either (for the round). */
export type BoostTiming = 'mine' | 'theirs' | 'round';

export interface Boost {
  id: BoostId;
  name: string;
  /** One line for the store and the power bar. */
  tagline: string;
  price: number;
  timing: BoostTiming;
  /** Effect colour: glow, sparks and the chip in the power bar. */
  color: string;
  /** Shouted when it's armed. */
  shout: string;
}

export const BOOSTS: Boost[] = [
  {
    id: 'lightning',
    name: 'Lightning Bolt',
    tagline: 'When your pen touches theirs, lightning strikes it away.',
    price: 25,
    timing: 'mine',
    color: '#7fd4ff',
    shout: 'ZAP!',
  },
  {
    id: 'health',
    name: 'Health Boost',
    tagline: 'If your pen falls off this round, it comes back once.',
    price: 30,
    timing: 'round',
    color: '#ff5a7a',
    shout: 'HEALTH UP!',
  },
  {
    id: 'grip',
    name: 'Super Grip',
    tagline: 'Your pen grips the desk and turns heavy for their shot.',
    price: 35,
    timing: 'theirs',
    color: '#7ddc6a',
    shout: 'GRIP!',
  },
  {
    id: 'ice',
    name: 'Ice Desk',
    tagline: 'Freezes the desk for their shot. Everything slides.',
    price: 45,
    timing: 'theirs',
    color: '#bfefff',
    shout: 'FREEZE!',
  },
  {
    id: 'strike',
    name: 'Power Strike',
    tagline: 'Your next flick hits half as hard again.',
    price: 50,
    timing: 'mine',
    color: '#ff8a1f',
    shout: 'POWER STRIKE!',
  },
  {
    id: 'tilt',
    name: 'Uneven Desk',
    tagline: 'Tips the desk down towards their end for their shot.',
    price: 60,
    timing: 'theirs',
    color: '#d9a35b',
    shout: 'WOBBLE!',
  },
  {
    id: 'wall',
    name: 'Force Wall',
    tagline: 'Glowing walls round your half of the desk for their shot.',
    price: 75,
    timing: 'theirs',
    color: '#5ea8ff',
    shout: 'SHIELD UP!',
  },
  {
    id: 'double',
    name: 'Double Turn',
    tagline: 'Shoot again straight after this shot.',
    price: 100,
    timing: 'mine',
    color: '#c58bff',
    shout: 'DOUBLE TURN!',
  },
];

const BY_ID = new Map(BOOSTS.map((b) => [b.id, b]));

export function boost(id: BoostId): Boost {
  return BY_ID.get(id) ?? BOOSTS[0];
}

export function isBoostId(v: unknown): v is BoostId {
  return typeof v === 'string' && BY_ID.has(v as BoostId);
}

/** How many of each super power a player holds. */
export type BoostBag = Partial<Record<BoostId, number>>;

/** Most of one super power a player can hold. */
export const MAX_BOOSTS = 9;

/** In practice every super power can be tried once a match, for free. */
export const PRACTICE_BAG: BoostBag = Object.fromEntries(BOOSTS.map((b) => [b.id, 1]));
