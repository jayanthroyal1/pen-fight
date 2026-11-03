/**
 * Hero powers sold in the store. Each one is applied to a single pen: it
 * re-skins the pen, gives it a unique entry, flick and strike style and a
 * finishing move for breaking a beaten pen, and adds a small power boost.
 * The heroes are original; they only nod to the ones every class argues about.
 */
export type PowerId = 'giant' | 'webflick' | 'comet' | 'nightwing' | 'amazon' | 'chakra' | 'hanuman';

/** How the pen arrives on the desk at the start of a match. */
export type EntryStyle = 'slam' | 'swing' | 'flyin' | 'swoop' | 'lasso' | 'spin' | 'descend';

export interface PowerSkin {
  barrel: string;
  cap: string;
  plug: string;
  nib: string;
  grip?: string;
  trim: string;
  /** A band of colour round the barrel, for the hero's emblem. */
  band: string;
  print: string;
  printColor: string;
  finish: 'plastic' | 'metal' | 'lacquer' | 'matte';
}

export interface Power {
  id: PowerId;
  name: string;
  /** One line for the store. */
  tagline: string;
  price: number;
  /** Main and accent colours of effects: glow, trails, rings. */
  color: string;
  accent: string;
  /** Shouted on entry and on every strike. */
  shout: string;
  entry: EntryStyle;
  skin: PowerSkin;
}

/** Extra flick impulse a powered pen gets. */
export const POWER_BOOST = 1.1;

export const POWERS: Power[] = [
  {
    id: 'giant',
    name: 'Green Giant',
    tagline: 'Drops from the sky and smashes the desk.',
    price: 600,
    color: '#4caf50',
    accent: '#7b3fa0',
    shout: 'SMASH!',
    entry: 'slam',
    skin: {
      barrel: '#3f8f3a', cap: '#6b2f8f', plug: '#6b2f8f', nib: '#6b2f8f', grip: '#2f6d2b', trim: '#9fd28a',
      band: '#6b2f8f', print: 'GIANT · SMASH', printColor: '#e9ffe2', finish: 'lacquer',
    },
  },
  {
    id: 'webflick',
    name: 'Web Flicker',
    tagline: 'Swings in on a web line. Thwip!',
    price: 500,
    color: '#e53935',
    accent: '#1e4fd6',
    shout: 'THWIP!',
    entry: 'swing',
    skin: {
      barrel: '#d32f2f', cap: '#1e4fd6', plug: '#1e4fd6', nib: '#1e4fd6', grip: '#1e4fd6', trim: '#f2f2f2',
      band: '#111111', print: 'WEB FLICKER', printColor: '#ffffff', finish: 'lacquer',
    },
  },
  {
    id: 'comet',
    name: 'Steel Comet',
    tagline: 'Flies in faster than a speeding pen.',
    price: 800,
    color: '#2f6fe0',
    accent: '#e53935',
    shout: 'WHOOSH!',
    entry: 'flyin',
    skin: {
      barrel: '#1f5fd1', cap: '#d62828', plug: '#d62828', nib: '#f2c230', grip: '#d62828', trim: '#f2c230',
      band: '#f2c230', print: 'STEEL COMET', printColor: '#fff6cc', finish: 'lacquer',
    },
  },
  {
    id: 'nightwing',
    name: 'Night Wing',
    tagline: 'Swoops down out of the dark.',
    price: 700,
    color: '#f2c230',
    accent: '#1a1a22',
    shout: 'THWACK!',
    entry: 'swoop',
    skin: {
      barrel: '#1a1b22', cap: '#2b2d36', plug: '#f2c230', nib: '#2b2d36', grip: '#2b2d36', trim: '#f2c230',
      band: '#f2c230', print: 'NIGHT WING', printColor: '#f2c230', finish: 'matte',
    },
  },
  {
    id: 'amazon',
    name: 'Amazon Lasso',
    tagline: 'Arrives in a ring of golden rope.',
    price: 650,
    color: '#f2c230',
    accent: '#c62828',
    shout: 'LASSO!',
    entry: 'lasso',
    skin: {
      barrel: '#b71c1c', cap: '#1e3a8a', plug: '#f2c230', nib: '#f2c230', grip: '#1e3a8a', trim: '#f2c230',
      band: '#f2c230', print: 'AMAZON · LASSO', printColor: '#fff3c4', finish: 'lacquer',
    },
  },
  {
    id: 'chakra',
    name: 'Chakra Spin',
    tagline: 'Spins down like a top and never stops.',
    price: 550,
    color: '#ff9f1c',
    accent: '#c1121f',
    shout: 'CHAKRA!',
    entry: 'spin',
    skin: {
      barrel: '#c1121f', cap: '#f2c230', plug: '#f2c230', nib: '#f2c230', grip: '#8a0f17', trim: '#f2c230',
      band: '#ffffff', print: 'CHAKRA · SPIN', printColor: '#fff3c4', finish: 'lacquer',
    },
  },
  {
    id: 'hanuman',
    name: 'Hanuman Gada',
    tagline: 'The pen becomes a golden mace. Jai Hanuman!',
    price: 1500,
    color: '#ffb300',
    accent: '#ff6f00',
    shout: 'JAI HANUMAN!',
    entry: 'descend',
    skin: {
      barrel: '#d4a017', cap: '#e8b923', plug: '#ff6f00', nib: '#e8b923', trim: '#fff1a8',
      band: '#ff6f00', print: 'GADA', printColor: '#7a3e00', finish: 'metal',
    },
  },
];

const BY_ID = new Map(POWERS.map((p) => [p.id, p]));

export function power(id: PowerId): Power {
  return BY_ID.get(id) ?? POWERS[0];
}

export function isPowerId(v: unknown): v is PowerId {
  return typeof v === 'string' && BY_ID.has(v as PowerId);
}
