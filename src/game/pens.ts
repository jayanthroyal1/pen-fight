/**
 * Every pen in the game, as sold in the store, modelled on real Indian
 * school pens. `level` (1–5) sets which bet rooms a pen may play in, and
 * `power` its hit strength: the pen's mass scales with power and its flick
 * impulse grows a little faster than its mass, so a stronger pen both travels
 * a bit further and shoves the other pen harder while being harder to shove.
 */
export type PenModelId =
  | 'inkmax-aqua'
  | 'inkmax-rose'
  | 'gripper'
  | 'frosty'
  | 'clear-grip'
  | 'butterfly-pink'
  | 'navy-writer'
  | 'techno-tip'
  | 'click-red'
  | 'click-sky'
  | 'click-blue'
  | 'four-colour'
  | 'teal-alu'
  | 'rose-alu'
  | 'gunmetal'
  | 'silver-stripe'
  | 'exec-gold-clip'
  | 'gold-dot'
  | 'silver-line'
  | 'flamingo-gold';

export type PenLevel = 1 | 2 | 3 | 4 | 5;

/** How the barrel is finished: decides shine and reflections. */
export type Finish = 'plastic' | 'translucent' | 'pearl' | 'matte' | 'lacquer' | 'metal';

/**
 * Printing on the barrel (or its grip): gold dots, a colourful graphic,
 * thin rings, or a silver label band with coloured spots.
 */
export interface PenPattern {
  kind: 'dots' | 'graphic' | 'rings' | 'label';
  colors: string[];
  /** Where it's printed; the barrel by default. */
  on?: 'barrel' | 'grip';
}

export interface PenLook {
  /** Capped stick pen (cap posted on the back), or a click pen with a plunger and clip. */
  form?: 'capped' | 'click';
  /** Barrel colour. */
  barrel: string;
  barrelShape: 'hex' | 'round';
  finish: Finish;
  /** Ink colour: the refill seen through a clear barrel, and the writing tip. */
  ink: string;
  /** Cap posted on the back end (capped pens), or the top collar (click pens). */
  cap: string;
  /** End of the cap, or the click pen's plunger. */
  plug: string;
  /** Nose cone around the writing tip. */
  nib: string;
  grip?: string;
  /** Metal rings and clip colour; plain plastic clip when absent. */
  trim?: string;
  pattern?: PenPattern;
  /** A multi-colour pen's ink sliders round the top. */
  sliders?: string[];
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

const CHROME = '#dfe3e8';
const GOLD = '#d4af37';

export const PEN_MODELS: PenModel[] = [
  // Level 1: capped stick pens every school bag has.
  pen('inkmax-aqua', 'Ink Max Aqua', 1, 50, 0.7, {
    barrel: '#e8f4f8', barrelShape: 'round', finish: 'translucent', ink: '#19a7b8', cap: '#4fd3e0', plug: '#4fd3e0',
    nib: '#4fd3e0', pattern: { kind: 'label', colors: ['#c9ced6', '#4fd3e0', '#d93a2f'] },
    print: 'INK MAX · SMOOTH', printColor: '#1b6f7a',
  }),
  pen('inkmax-rose', 'Ink Max Rose', 1, 60, 0.72, {
    barrel: '#fbe9f0', barrelShape: 'round', finish: 'translucent', ink: '#d6337a', cap: '#f07aa8', plug: '#f07aa8',
    nib: '#f07aa8', pattern: { kind: 'label', colors: ['#c9ced6', '#f07aa8', '#d93a2f'] },
    print: 'INK MAX · SMOOTH', printColor: '#a3245c',
  }),
  pen('gripper', 'Clear Gripper', 1, 70, 0.74, {
    barrel: '#e9eef5', barrelShape: 'round', finish: 'translucent', ink: '#1f3f9a', cap: '#1f3f9a', plug: '#1f3f9a',
    nib: '#e2e5ea', grip: '#1f3f9a', print: 'GRIPPER · 0.7', printColor: '#1f3f9a',
  }),
  pen('frosty', 'Frosty Blue', 1, 80, 0.75, {
    barrel: '#2a4fbf', barrelShape: 'round', finish: 'matte', ink: '#1f3f9a', cap: '#f2f4f8', plug: '#f2f4f8',
    nib: '#f2f4f8', print: 'FROSTY', printColor: '#ffffff',
  }),
  // Level 2: gel pens with grips and printed barrels.
  pen('clear-grip', 'Pinpoint Clear', 2, 150, 0.85, {
    barrel: '#dfe9f7', barrelShape: 'round', finish: 'translucent', ink: '#2f63c9', cap: '#9cc0ef', plug: '#9cc0ef',
    nib: '#2f63c9', grip: '#2f63c9', print: 'PINPOINT GEL', printColor: '#2f63c9',
  }),
  pen('butterfly-pink', 'Butterfly Pink Graphic', 2, 180, 0.87, {
    barrel: '#ffffff', barrelShape: 'round', finish: 'plastic', ink: '#1b1b1b', cap: '#1b1b1b', plug: '#1b1b1b',
    nib: '#cfd3da', grip: '#1b1b1b',
    pattern: { kind: 'graphic', colors: ['#ff5fa2', '#ffd23f', '#3a86ff', '#1b1b1b', '#ff8fab'] },
    print: 'BUTTERFLY', printColor: '#1b1b1b',
  }),
  pen('navy-writer', 'Navy Writer', 2, 200, 0.88, {
    barrel: '#e8edf3', barrelShape: 'round', finish: 'translucent', ink: '#1b2f6b', cap: '#1b2f6b', plug: '#1b2f6b',
    nib: '#d8dbe0', grip: '#1b2f6b', print: 'WRITER XS', printColor: '#1b2f6b',
  }),
  pen('techno-tip', 'Techno Tip Blue', 2, 250, 0.9, {
    barrel: '#2b6fd6', barrelShape: 'round', finish: 'translucent', ink: '#16337a', cap: '#16337a', plug: '#16337a',
    nib: '#16337a', pattern: { kind: 'label', colors: ['#7fd8e6', '#ffffff', '#d93a2f'] },
    print: 'TECHNO TIP', printColor: '#ffffff',
  }),
  // Level 3: click gel pens with rubber grips.
  pen('click-red', 'Click Gel Red', 3, 350, 1, {
    form: 'click', barrel: '#d62828', barrelShape: 'round', finish: 'plastic', ink: '#1f3f9a', cap: '#d62828',
    plug: CHROME, nib: CHROME, grip: '#b81f1f', trim: CHROME, print: 'CLICK GEL', printColor: '#ffe3e3',
  }),
  pen('click-sky', 'Click Gel Sky', 3, 400, 1.02, {
    form: 'click', barrel: '#3aa7e0', barrelShape: 'round', finish: 'plastic', ink: '#1f3f9a', cap: '#3aa7e0',
    plug: CHROME, nib: CHROME, grip: '#2b8fc4', trim: CHROME, print: 'CLICK GEL', printColor: '#e6f6ff',
  }),
  pen('click-blue', 'Pinpoint Click', 3, 420, 1.03, {
    form: 'click', barrel: '#1f4fc9', barrelShape: 'round', finish: 'lacquer', ink: '#1f3f9a', cap: '#1f4fc9',
    plug: '#1f4fc9', nib: '#1f4fc9', grip: '#173a99', trim: CHROME, print: 'PINPOINT CLICK', printColor: '#ffffff',
  }),
  pen('four-colour', '4-Colour Click', 3, 500, 1.05, {
    form: 'click', barrel: '#f4f4f0', barrelShape: 'round', finish: 'plastic', ink: '#1f4fc9', cap: '#c6e86b',
    plug: '#c6e86b', nib: '#f4f4f0', grip: '#c6e86b', trim: '#c6e86b',
    sliders: ['#1f4fc9', '#d62828', '#1b1b1b', '#2e9a5a'], print: '4 COLOUR', printColor: '#5a5a5a',
  }),
  // Level 4: metal click pens.
  pen('teal-alu', 'Teal Aluminium', 4, 600, 1.15, {
    form: 'click', barrel: '#2aa7c9', barrelShape: 'round', finish: 'metal', ink: '#1b2f6b', cap: '#2aa7c9',
    plug: CHROME, nib: CHROME, trim: CHROME, pattern: { kind: 'rings', colors: [CHROME] },
    print: 'ALUMINIUM', printColor: '#e6fbff',
  }),
  pen('rose-alu', 'Rose Gold Click', 4, 750, 1.17, {
    form: 'click', barrel: '#d98a9a', barrelShape: 'round', finish: 'metal', ink: '#2a2a2a', cap: '#d98a9a',
    plug: '#f4d2c4', nib: '#f4d2c4', trim: '#f4d2c4', pattern: { kind: 'rings', colors: ['#f4d2c4'] },
    print: 'ROSE GOLD', printColor: '#6a3a30',
  }),
  pen('gunmetal', 'Gunmetal Grip', 4, 800, 1.18, {
    form: 'click', barrel: '#3a3f48', barrelShape: 'round', finish: 'metal', ink: '#0d1b4a', cap: '#3a3f48',
    plug: CHROME, nib: CHROME, grip: '#2b2f36', trim: CHROME, pattern: { kind: 'dots', colors: ['#14161a'], on: 'grip' },
    print: 'GUNMETAL', printColor: '#d9dce1',
  }),
  pen('silver-stripe', 'Silver Stripe', 4, 900, 1.2, {
    form: 'click', barrel: '#7fa2d6', barrelShape: 'round', finish: 'metal', ink: '#0d1b4a', cap: '#7fa2d6',
    plug: CHROME, nib: CHROME, trim: CHROME, pattern: { kind: 'rings', colors: ['#1b1b1b'], on: 'grip' },
    print: 'SILVER STRIPE', printColor: '#16243f',
  }),
  // Level 5: executive pens.
  pen('exec-gold-clip', 'Executive Gold Clip', 5, 1000, 1.3, {
    form: 'click', barrel: '#1b1b1b', barrelShape: 'round', finish: 'matte', ink: '#0d1b4a', cap: '#1b1b1b',
    plug: GOLD, nib: '#1b1b1b', trim: GOLD, print: 'EXECUTIVE', printColor: GOLD,
  }),
  pen('gold-dot', 'Gold Dot Lacquer', 5, 1200, 1.32, {
    barrel: '#121212', barrelShape: 'round', finish: 'lacquer', ink: '#0d1b4a', cap: GOLD, plug: GOLD, nib: GOLD,
    trim: GOLD, pattern: { kind: 'dots', colors: [GOLD] }, print: 'GOLD DOT', printColor: GOLD,
  }),
  pen('silver-line', 'Silver Line Roller', 5, 1350, 1.34, {
    barrel: '#101010', barrelShape: 'round', finish: 'lacquer', ink: '#0d1b4a', cap: '#101010', plug: '#1f3f9a',
    nib: CHROME, trim: CHROME, print: 'SILVER LINE', printColor: '#c9cdd2',
  }),
  pen('flamingo-gold', 'Flamingo Gold', 5, 1500, 1.35, {
    barrel: '#e75a93', barrelShape: 'round', finish: 'lacquer', ink: '#1a1a1a', cap: GOLD, plug: GOLD, nib: GOLD,
    trim: GOLD, print: 'FLAMINGO · LIMITED', printColor: '#fff0f6',
  }),
];

/** Pens from earlier versions of the game, and the pen each became. */
const RENAMED: Record<string, PenModelId> = {
  ballpoint: 'inkmax-aqua',
  blossom: 'inkmax-rose',
  chalkline: 'gripper',
  tutor: 'frosty',
  reynolds: 'clear-grip',
  rosequill: 'butterfly-pink',
  neonzip: 'navy-writer',
  inkjet: 'techno-tip',
  cello: 'click-red',
  sakura: 'click-sky',
  oceanwave: 'click-blue',
  redline: 'four-colour',
  addgel: 'teal-alu',
  rosegold: 'rose-alu',
  midnight: 'gunmetal',
  emerald: 'silver-stripe',
  retro51: 'exec-gold-clip',
  flamingo: 'flamingo-gold',
  titan: 'silver-line',
  royalgold: 'gold-dot',
};

const BY_ID = new Map(PEN_MODELS.map((m) => [m.id, m]));

export function penModel(id: PenModelId): PenModel {
  return BY_ID.get(id) ?? PEN_MODELS[0];
}

export function isPenModelId(v: unknown): v is PenModelId {
  return typeof v === 'string' && BY_ID.has(v as PenModelId);
}

/** A pen id from any version of the game, as today's pen. */
export function currentPenId(id: string): PenModelId {
  return isPenModelId(id) ? id : (RENAMED[id] ?? PEN_MODELS[0].id);
}

export const isMetalPen = (id: PenModelId) => penModel(id).look.finish === 'metal';

/** Mass in Rapier units. */
export const massOf = (id: PenModelId) => penModel(id).power;

/** Multiplier applied to a flick's impulse. */
export const impulseScaleOf = (id: PenModelId) => penModel(id).power ** 1.5;
