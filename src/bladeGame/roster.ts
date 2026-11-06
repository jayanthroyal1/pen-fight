import { moveSet, special, type AttackDefinition } from './attacks';
import type { AiProfile } from './ai';
import type { FighterSpec } from './combat';

/**
 * Who fights, and the story they fight through. All original: the handbook's
 * licensed heroes are replaced by these four. Adding a fighter means adding a
 * row here, not touching the combat code.
 */

export interface Hero {
  id: string;
  name: string;
  title: string;
  blurb: string;
  color: string;
  hair: string;
  bladeColor: string;
  maxHp: number;
  speed: number;
  bladeLength: number;
  moves: AttackDefinition[];
  special: AttackDefinition;
  specialName: string;
}

export const HEROES: Hero[] = [
  {
    id: 'aren',
    name: 'Aren Vale',
    title: 'The Wind Blade',
    blurb: 'Balanced and quick to recover.',
    color: '#2d6cdf',
    hair: '#d9e6ff',
    bladeColor: '#bfe3ff',
    maxHp: 110,
    speed: 5,
    bladeLength: 1.05,
    moves: moveSet('AREN', { speed: 1, power: 1, reach: 1 }),
    special: special('AREN', 'GALE_CUT', 26, true),
    specialName: 'Gale Cut',
  },
  {
    id: 'mira',
    name: 'Mira Solen',
    title: 'The Ember Dancer',
    blurb: 'Very fast, but light on hits.',
    color: '#e0432b',
    hair: '#ffb35a',
    bladeColor: '#ff8a2a',
    maxHp: 92,
    speed: 6,
    bladeLength: 0.95,
    moves: moveSet('MIRA', { speed: 0.8, power: 0.82, reach: 0.9 }),
    special: special('MIRA', 'SUNBURST', 30),
    specialName: 'Sunburst',
  },
  {
    id: 'gorran',
    name: 'Gorran Holt',
    title: 'The Iron Wall',
    blurb: 'Slow, heavy, and hard to stagger.',
    color: '#5a6472',
    hair: '#2a2f38',
    bladeColor: '#c8d2e0',
    maxHp: 140,
    speed: 4.2,
    bladeLength: 1.4,
    moves: moveSet('GORRAN', { speed: 1.28, power: 1.4, reach: 1.3 }),
    special: special('GORRAN', 'QUAKE_BREAKER', 36),
    specialName: 'Quake Breaker',
  },
  {
    id: 'nori',
    name: 'Nori Hale',
    title: 'The Still Water',
    blurb: 'Long reach and a sharp counter.',
    color: '#18a58c',
    hair: '#102a2a',
    bladeColor: '#a8fff0',
    maxHp: 100,
    speed: 5.2,
    bladeLength: 1.25,
    moves: moveSet('NORI', { speed: 0.95, power: 0.95, reach: 1.15 }),
    special: special('NORI', 'TIDE_LANCE', 28, true),
    specialName: 'Tide Lance',
  },
];

export interface Villain {
  id: string;
  /** Whose model this enemy uses: minor enemies borrow one. */
  model: string;
  name: string;
  color: string;
  hair: string;
  bladeColor: string;
  spec: Omit<FighterSpec, 'team'>;
  ai: AiProfile;
}

const foe = (id: string, name: string, color: string, hair: string, bladeColor: string, spec: Omit<FighterSpec, 'team' | 'id'>, ai: AiProfile, model = id): Villain => ({
  id,
  model,
  name,
  color,
  hair,
  bladeColor,
  spec: { ...spec, id },
  ai,
});

const raider = foe('raider', 'Ash Raider', '#6d4a3a', '#2a1a14', '#9aa7b8', {
  maxHp: 95,
  speed: 3.9,
  bladeLength: 1.05,
  moves: moveSet('RAIDER', { speed: 1.2, power: 0.7, reach: 1 }),
  special: special('RAIDER', 'WILD_SWING', 16),
  damageScale: 0.85,
}, { archetype: 'bruiser', reactionMs: 520, accuracy: 0.3, comboDepth: 1, defence: 0.12, adaptation: 0, risk: 0.5, preferredRange: 1.5 }, 'gorran');

const zarok = foe('zarok', 'Zarok', '#8e2b2b', '#e8e4da', '#c8d2e0', {
  maxHp: 170,
  speed: 3.9,
  bladeLength: 1.55,
  moves: moveSet('ZAROK', { speed: 1.3, power: 1.2, reach: 1.4 }),
  special: special('ZAROK', 'SHOCKWAVE_SLASH', 30, true),
  poise: 'light',
}, { archetype: 'bruiser', reactionMs: 420, accuracy: 0.45, comboDepth: 2, defence: 0.25, adaptation: 0.1, risk: 0.75, preferredRange: 1.9 });

const guard = foe('sentinel', 'Silver Sentinel', '#7a7f8a', '#14161a', '#e0e8f0', {
  maxHp: 110,
  speed: 4.6,
  bladeLength: 1.1,
  moves: moveSet('SENTINEL', { speed: 0.98, power: 0.95, reach: 1 }),
  special: special('SENTINEL', 'PIERCE', 24),
}, { archetype: 'duelist', reactionMs: 340, accuracy: 0.55, comboDepth: 2, defence: 0.45, adaptation: 0.2, risk: 0.4, preferredRange: 1.7 }, 'ryujin');

const ryujin = foe('ryujin', 'Ryujin', '#161a24', '#e8eef5', '#ff3048', {
  maxHp: 150,
  speed: 5.6,
  bladeLength: 1.1,
  moves: moveSet('RYUJIN', { speed: 0.82, power: 1, reach: 1 }),
  special: special('RYUJIN', 'AFTERIMAGE_SLASH', 30),
}, { archetype: 'duelist', reactionMs: 240, accuracy: 0.72, comboDepth: 3, defence: 0.7, adaptation: 0.5, risk: 0.35, preferredRange: 1.8 });

const shade = foe('voidshade', 'Void Shade', '#2c1f4d', '#8a6cff', '#b48cff', {
  maxHp: 140,
  speed: 5.4,
  bladeLength: 1.15,
  moves: moveSet('SHADE', { speed: 0.86, power: 1.05, reach: 1.05 }),
  special: special('SHADE', 'VOID_LASH', 30, true),
}, { archetype: 'duelist', reactionMs: 210, accuracy: 0.74, comboDepth: 3, defence: 0.6, adaptation: 0.5, risk: 0.5, preferredRange: 2.2 }, 'kaelis');

const kaelis = foe('kaelis', 'Kaelis', '#2a1a4a', '#120a22', '#a06cff', {
  maxHp: 230,
  speed: 5.2,
  bladeLength: 1.25,
  moves: moveSet('KAELIS', { speed: 0.88, power: 1.2, reach: 1.15 }),
  special: special('KAELIS', 'VOID_RIFT', 34, true),
  poise: 'light',
}, { archetype: 'boss', reactionMs: 170, accuracy: 0.85, comboDepth: 3, defence: 0.72, adaptation: 0.7, risk: 0.6, preferredRange: 3.2, enragedAt: 0.5 });

export interface Chapter {
  id: number;
  act: string;
  title: string;
  place: string;
  arena: ArenaId;
  foe: Villain;
  before: { who: string; line: string }[];
  after: string;
}

export type ArenaId = 'ashfield' | 'warcamp' | 'silverhall' | 'stormtemple' | 'riftgate' | 'voidthrone';

export const CHAPTERS: Chapter[] = [
  {
    id: 1,
    act: 'Act I: The Beast General',
    title: 'Ash on the Wind',
    place: 'The Ashfields',
    arena: 'ashfield',
    foe: raider,
    before: [
      { who: 'Narrator', line: 'Three warlords split the world between them. Yours was the last free city, until tonight.' },
      { who: 'Ash Raider', line: 'General Zarok wants the city flat by dawn. You first.' },
      { who: 'hero', line: 'Then tell him I’m coming.' },
    ],
    after: 'The raider’s banner names his camp. If Zarok falls, the siege breaks.',
  },
  {
    id: 2,
    act: 'Act I: The Beast General',
    title: 'The Beast at the Gate',
    place: 'Zarok’s War Camp',
    arena: 'warcamp',
    foe: zarok,
    before: [
      { who: 'Zarok', line: 'A small one with a small sword. I have broken mountains.' },
      { who: 'hero', line: 'You’ve never fought someone with nothing left to lose.' },
      { who: 'Zarok', line: 'Good. Then you won’t waste my time running.' },
    ],
    after: 'Zarok kneels. “You think I led this? Ryujin plans every war. I only finish them.”',
  },
  {
    id: 3,
    act: 'Act II: The Cyber Samurai',
    title: 'The Silver Hall',
    place: 'Ryujin’s Fortress',
    arena: 'silverhall',
    foe: guard,
    before: [
      { who: 'Narrator', line: 'Ryujin’s fortress has no gate. It has a door, and one guard who has never lost.' },
      { who: 'Silver Sentinel', line: 'Your swings were recorded on the road. I already know your rhythm.' },
      { who: 'hero', line: 'Then I’ll change the song.' },
    ],
    after: 'The Sentinel’s blade shatters. The stairs to the storm temple stand open.',
  },
  {
    id: 4,
    act: 'Act II: The Cyber Samurai',
    title: 'Rain on Steel',
    place: 'The Storm Temple',
    arena: 'stormtemple',
    foe: ryujin,
    before: [
      { who: 'Ryujin', line: 'I have watched your last thousand strikes. You favour the left.' },
      { who: 'hero', line: 'And you talk too much for a machine.' },
      { who: 'Ryujin', line: 'Attack, then. I will answer before you finish.' },
    ],
    after: 'Ryujin’s last words are a warning: “Kaelis does not want the world. He wants what’s under it.”',
  },
  {
    id: 5,
    act: 'Act III: The Void Lord',
    title: 'The Rift Opens',
    place: 'The Rift Gate',
    arena: 'riftgate',
    foe: shade,
    before: [
      { who: 'Narrator', line: 'The sky over the Rift has turned the wrong colour. Things are walking out of it.' },
      { who: 'Void Shade', line: 'He has seen you already. He says you end here.' },
      { who: 'hero', line: 'He’s wrong about a lot of things.' },
    ],
    after: 'The shade unravels into smoke, and the smoke drifts towards a throne that wasn’t there before.',
  },
  {
    id: 6,
    act: 'Act III: The Void Lord',
    title: 'The Void Throne',
    place: 'Beyond the Rift',
    arena: 'voidthrone',
    foe: kaelis,
    before: [
      { who: 'Kaelis', line: 'You beat my general and my strategist. Do you know what that makes you?' },
      { who: 'hero', line: 'The last thing you’ll ever see.' },
      { who: 'Kaelis', line: 'No. Useful. Kneel, and I will let your city keep its name.' },
    ],
    after: 'The Rift folds shut behind Kaelis. The three warlords are gone, and the sun comes up over a city that’s still standing.',
  },
];

export const heroSpec = (hero: Hero): FighterSpec => ({ id: hero.id, team: 0, maxHp: hero.maxHp, speed: hero.speed, bladeLength: hero.bladeLength, moves: hero.moves, special: hero.special });

export const villainSpec = (v: Villain): FighterSpec => ({ ...v.spec, team: 1 });
