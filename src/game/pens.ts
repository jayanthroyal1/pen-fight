/**
 * The pens a player can choose. `power` drives hit strength: the pen's mass
 * scales with it, and its flick impulse grows a little faster than its mass,
 * so a stronger pen both travels a bit further and shoves the other pen harder
 * while being harder to shove itself.
 */
export type PenModelId = 'ballpoint' | 'reynolds' | 'cello' | 'addgel' | 'retro51';

export interface PenLook {
  /** Barrel plastic (or metal) colour. */
  barrel: string;
  barrelShape: 'hex' | 'round';
  /** See-through barrel that shows the ink refill inside. */
  translucent: boolean;
  /** Ink colour: the refill, and the writing tip. */
  ink: string;
  /** Posted cap at the back end, with its clip. */
  cap: string;
  /** Plug closing the back of the barrel. */
  plug: string;
  /** Nose cone around the writing tip. */
  nib: string;
  grip?: string;
  /** Polished metal body instead of plastic. */
  metal: boolean;
  /** Small text printed along the barrel. */
  print: string;
  printColor: string;
}

export interface PenModel {
  id: PenModelId;
  name: string;
  powerLabel: string;
  /** Relative hit power, 1 = medium. */
  power: number;
  look: PenLook;
}

export const PEN_MODELS: PenModel[] = [
  {
    id: 'ballpoint',
    name: '₹3 Ballpoint',
    powerLabel: 'Least power',
    power: 0.7,
    look: {
      barrel: '#eef3f7',
      barrelShape: 'hex',
      translucent: true,
      ink: '#1d44b8',
      cap: '#1d44b8',
      plug: '#1d44b8',
      nib: '#f2f2ee',
      metal: false,
      print: 'BALL PEN · MEDIUM',
      printColor: '#2a2f3a',
    },
  },
  {
    id: 'reynolds',
    name: 'Reynolds Gel Racer',
    powerLabel: 'Below medium',
    power: 0.85,
    look: {
      barrel: '#f5f3ee',
      barrelShape: 'round',
      translucent: false,
      ink: '#1f4cc4',
      cap: '#1f4cc4',
      plug: '#1f4cc4',
      nib: '#1f4cc4',
      grip: '#c8d6f2',
      metal: false,
      print: 'GEL 0.5 · SMOOTH WRITING',
      printColor: '#1f4cc4',
    },
  },
  {
    id: 'cello',
    name: 'Cello Pointec',
    powerLabel: 'Medium',
    power: 1,
    look: {
      barrel: '#16181d',
      barrelShape: 'round',
      translucent: false,
      ink: '#1f4cc4',
      cap: '#2357d6',
      plug: '#2357d6',
      nib: '#2357d6',
      grip: '#2357d6',
      metal: false,
      print: 'NEEDLE POINT 0.6',
      printColor: '#c9ccd2',
    },
  },
  {
    id: 'addgel',
    name: 'Add Gel',
    powerLabel: 'Powerful',
    power: 1.15,
    look: {
      barrel: '#2a3f9e',
      barrelShape: 'round',
      translucent: true,
      ink: '#14287a',
      cap: '#1a2a6c',
      plug: '#1a2a6c',
      nib: '#c9ccd2',
      grip: '#1b1d22',
      metal: false,
      print: 'GEL INK · 0.7',
      printColor: '#e8ecf5',
    },
  },
  {
    id: 'retro51',
    name: 'Retro 51 Tornado',
    powerLabel: 'Most powerful',
    power: 1.3,
    look: {
      barrel: '#b9c0c8',
      barrelShape: 'round',
      translucent: false,
      ink: '#141414',
      cap: '#b07a3c',
      plug: '#b07a3c',
      nib: '#b07a3c',
      metal: true,
      print: 'ROLLERBALL',
      printColor: '#3a3f46',
    },
  },
];

const BY_ID = new Map(PEN_MODELS.map((m) => [m.id, m]));

export function penModel(id: PenModelId): PenModel {
  return BY_ID.get(id) ?? PEN_MODELS[2];
}

export function isPenModelId(v: unknown): v is PenModelId {
  return typeof v === 'string' && BY_ID.has(v as PenModelId);
}

/** Mass in Rapier units. */
export const massOf = (id: PenModelId) => penModel(id).power;

/** Multiplier applied to a flick's impulse. */
export const impulseScaleOf = (id: PenModelId) => penModel(id).power ** 1.5;
