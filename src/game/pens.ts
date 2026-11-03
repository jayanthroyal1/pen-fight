/**
 * Every pen in the game, as sold in the store. `level` (1–5) sets which bet
 * rooms a pen may play in, and `power` its hit strength: the pen's mass scales
 * with power and its flick impulse grows a little faster than its mass, so a
 * stronger pen both travels a bit further and shoves the other pen harder
 * while being harder to shove itself.
 */
export type PenModelId =
  | 'ballpoint'
  | 'blossom'
  | 'chalkline'
  | 'tutor'
  | 'reynolds'
  | 'rosequill'
  | 'neonzip'
  | 'inkjet'
  | 'cello'
  | 'sakura'
  | 'oceanwave'
  | 'redline'
  | 'addgel'
  | 'rosegold'
  | 'midnight'
  | 'emerald'
  | 'retro51'
  | 'flamingo'
  | 'titan'
  | 'royalgold';

export type PenLevel = 1 | 2 | 3 | 4 | 5;

/** How the barrel is finished: decides shine and reflections. */
export type Finish = 'plastic' | 'translucent' | 'pearl' | 'matte' | 'lacquer' | 'metal';

export interface PenLook {
  /** Barrel colour. */
  barrel: string;
  barrelShape: 'hex' | 'round';
  finish: Finish;
  /** Ink colour: the refill seen through a clear barrel, and the writing tip. */
  ink: string;
  /** Cap posted on the back end, with its clip. */
  cap: string;
  /** End of the cap. */
  plug: string;
  /** Nose cone around the writing tip. */
  nib: string;
  grip?: string;
  /** Metal rings and clip colour; plain plastic clip when absent. */
  trim?: string;
  /** Small text printed along the barrel. */
  print: string;
  printColor: string;
}

export interface PenModel {
  id: PenModelId;
  name: string;
  level: PenLevel;
  /** Store price in game rupees. */
  price: number;
  /** Relative hit power, 1 = medium. */
  power: number;
  look: PenLook;
}

export const LEVEL_LABELS: Record<PenLevel, string> = {
  1: 'Least power',
  2: 'Below medium',
  3: 'Medium',
  4: 'Powerful',
  5: 'Most powerful',
};

const pen = (id: PenModelId, name: string, level: PenLevel, price: number, power: number, look: PenLook): PenModel => ({
  id,
  name,
  level,
  price,
  power,
  look,
});

export const PEN_MODELS: PenModel[] = [
  // Level 1: the stick pens every school bag has.
  pen('ballpoint', '₹3 Ballpoint', 1, 50, 0.7, {
    barrel: '#eef3f7', barrelShape: 'hex', finish: 'translucent', ink: '#1d44b8', cap: '#1d44b8', plug: '#1d44b8',
    nib: '#f2f2ee', print: 'BALL PEN · MEDIUM', printColor: '#2a2f3a',
  }),
  pen('blossom', 'Pink Blossom Stick', 1, 60, 0.72, {
    barrel: '#ffc8dc', barrelShape: 'hex', finish: 'translucent', ink: '#d6337a', cap: '#e8579a', plug: '#e8579a',
    nib: '#fbe3ec', print: 'BLOSSOM · SMOOTH', printColor: '#a3245c',
  }),
  pen('chalkline', 'Chalkline Stick', 1, 70, 0.74, {
    barrel: '#f4f2ea', barrelShape: 'hex', finish: 'plastic', ink: '#1e7a45', cap: '#2e9a5a', plug: '#2e9a5a',
    nib: '#2e9a5a', print: 'CHALKLINE 0.7', printColor: '#1e7a45',
  }),
  pen('tutor', 'Tutor Blue Stick', 1, 80, 0.75, {
    barrel: '#2c56c9', barrelShape: 'hex', finish: 'plastic', ink: '#1d3b8f', cap: '#1d3b8f', plug: '#f2f2ee',
    nib: '#f2f2ee', print: 'TUTOR · FINE', printColor: '#e8eefc',
  }),
  // Level 2: gel pens.
  pen('reynolds', 'Reynolds Gel Racer', 2, 150, 0.85, {
    barrel: '#f5f3ee', barrelShape: 'round', finish: 'plastic', ink: '#1f4cc4', cap: '#1f4cc4', plug: '#1f4cc4',
    nib: '#1f4cc4', grip: '#c8d6f2', print: 'GEL 0.5 · SMOOTH WRITING', printColor: '#1f4cc4',
  }),
  pen('rosequill', 'Rose Quill Gel', 2, 180, 0.87, {
    barrel: '#e7a3b4', barrelShape: 'round', finish: 'pearl', ink: '#b8325e', cap: '#c9848f', plug: '#c9848f',
    nib: '#c9848f', grip: '#f6d5de', trim: '#d9a08f', print: 'ROSE QUILL · GEL', printColor: '#7d2440',
  }),
  pen('neonzip', 'Neon Zip Gel', 2, 200, 0.88, {
    barrel: '#c7f05a', barrelShape: 'round', finish: 'translucent', ink: '#3b7d12', cap: '#2b2f33', plug: '#2b2f33',
    nib: '#2b2f33', grip: '#2b2f33', print: 'NEON ZIP 0.6', printColor: '#233d0b',
  }),
  pen('inkjet', 'Inkjet Fine', 2, 250, 0.9, {
    barrel: '#1d1f24', barrelShape: 'round', finish: 'plastic', ink: '#c62828', cap: '#c62828', plug: '#c62828',
    nib: '#c62828', grip: '#3a3d44', print: 'INKJET · FINE', printColor: '#f2c2c2',
  }),
  // Level 3: proper rollerballs.
  pen('cello', 'Cello Pointec', 3, 350, 1, {
    barrel: '#16181d', barrelShape: 'round', finish: 'plastic', ink: '#1f4cc4', cap: '#2357d6', plug: '#2357d6',
    nib: '#2357d6', grip: '#2357d6', print: 'NEEDLE POINT 0.6', printColor: '#c9ccd2',
  }),
  pen('sakura', 'Sakura Glide', 3, 400, 1.02, {
    barrel: '#f6cfd9', barrelShape: 'round', finish: 'pearl', ink: '#2b2b35', cap: '#ffffff', plug: '#f19ab2',
    nib: '#ffffff', grip: '#ffffff', trim: '#e8b4a4', print: 'SAKURA · GLIDE', printColor: '#b04a68',
  }),
  pen('oceanwave', 'Ocean Wave Gel', 3, 420, 1.03, {
    barrel: '#1a8f9c', barrelShape: 'round', finish: 'translucent', ink: '#0b4f6c', cap: '#0b4f6c', plug: '#0b4f6c',
    nib: '#d8dbe0', grip: '#0b4f6c', print: 'OCEAN WAVE', printColor: '#e6fbff',
  }),
  pen('redline', 'Redline Roller', 3, 500, 1.05, {
    barrel: '#c4161c', barrelShape: 'round', finish: 'lacquer', ink: '#151515', cap: '#151515', plug: '#151515',
    nib: '#151515', trim: '#d8dbe0', print: 'REDLINE ROLLER', printColor: '#ffe3e3',
  }),
  // Level 4: heavy gel and executive pens.
  pen('addgel', 'Add Gel', 4, 600, 1.15, {
    barrel: '#2a3f9e', barrelShape: 'round', finish: 'translucent', ink: '#14287a', cap: '#1a2a6c', plug: '#1a2a6c',
    nib: '#c9ccd2', grip: '#1b1d22', print: 'GEL INK · 0.7', printColor: '#e8ecf5',
  }),
  pen('rosegold', 'Rose Gold Roller', 4, 750, 1.17, {
    barrel: '#d8a091', barrelShape: 'round', finish: 'metal', ink: '#2a2a2a', cap: '#e9b8a8', plug: '#e9b8a8',
    nib: '#e9b8a8', trim: '#f4d2c4', print: 'ROSE GOLD', printColor: '#6a3a30',
  }),
  pen('midnight', 'Midnight Executive', 4, 800, 1.18, {
    barrel: '#15161b', barrelShape: 'round', finish: 'matte', ink: '#0d1b4a', cap: '#15161b', plug: '#d4af37',
    nib: '#d4af37', trim: '#d4af37', print: 'MIDNIGHT EXECUTIVE', printColor: '#d4af37',
  }),
  pen('emerald', 'Emerald Fountain', 4, 900, 1.2, {
    barrel: '#0f6b45', barrelShape: 'round', finish: 'lacquer', ink: '#0b3d91', cap: '#0f6b45', plug: '#d4af37',
    nib: '#d4af37', trim: '#d4af37', print: 'EMERALD · 14K', printColor: '#e8d18a',
  }),
  // Level 5: the pens nobody lends.
  pen('retro51', 'Retro 51 Tornado', 5, 1000, 1.3, {
    barrel: '#b9c0c8', barrelShape: 'round', finish: 'metal', ink: '#141414', cap: '#b07a3c', plug: '#b07a3c',
    nib: '#b07a3c', trim: '#d7dbe0', print: 'ROLLERBALL', printColor: '#3a3f46',
  }),
  pen('flamingo', 'Flamingo Lacquer', 5, 1200, 1.32, {
    barrel: '#ff4f9a', barrelShape: 'round', finish: 'lacquer', ink: '#1a1a1a', cap: '#ff7eb6', plug: '#f4c9a8',
    nib: '#f4c9a8', trim: '#f4c9a8', print: 'FLAMINGO · LIMITED', printColor: '#fff0f6',
  }),
  pen('titan', 'Titan Steel', 5, 1350, 1.34, {
    barrel: '#5b6067', barrelShape: 'hex', finish: 'metal', ink: '#111111', cap: '#3e4248', plug: '#3e4248',
    nib: '#9aa0a8', trim: '#c9cdd2', print: 'TITAN · STEEL', printColor: '#e4e6e9',
  }),
  pen('royalgold', 'Royal Gold Signature', 5, 1500, 1.35, {
    barrel: '#d4af37', barrelShape: 'round', finish: 'metal', ink: '#0d1b4a', cap: '#b8912a', plug: '#7a1f2b',
    nib: '#e8cf7a', trim: '#f1dc8f', print: 'ROYAL SIGNATURE', printColor: '#5a3d0a',
  }),
];

const BY_ID = new Map(PEN_MODELS.map((m) => [m.id, m]));

export function penModel(id: PenModelId): PenModel {
  return BY_ID.get(id) ?? PEN_MODELS[0];
}

export function isPenModelId(v: unknown): v is PenModelId {
  return typeof v === 'string' && BY_ID.has(v as PenModelId);
}

export const isMetalPen = (id: PenModelId) => penModel(id).look.finish === 'metal';

/** Mass in Rapier units. */
export const massOf = (id: PenModelId) => penModel(id).power;

/** Multiplier applied to a flick's impulse. */
export const impulseScaleOf = (id: PenModelId) => penModel(id).power ** 1.5;
