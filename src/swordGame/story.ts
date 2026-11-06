/** Everything the player chooses from, and the story they fight through. */

export type CharacterId = 'ronin' | 'shade' | 'titan' | 'viper';
export type SwordId = 'iron' | 'katana' | 'claymore' | 'ember';
export type PowerId = 'wave' | 'dash' | 'heal';

export interface Character {
  id: CharacterId;
  name: string;
  blurb: string;
  color: string;
  hp: number;
  speed: number;
  /** Multiplies the energy earned from fighting. */
  focus: number;
}

export interface Sword {
  id: SwordId;
  name: string;
  blurb: string;
  color: string;
  damage: number;
  /** Blade length, in metres. */
  length: number;
  /** Seconds to wind up, to stay dangerous, and to recover. */
  windup: number;
  active: number;
  recover: number;
  knock: number;
}

export interface Power {
  id: PowerId;
  name: string;
  blurb: string;
  cost: number;
}

export const CHARACTERS: Character[] = [
  { id: 'ronin', name: 'Ronin', blurb: 'Balanced in everything.', color: '#f2f0ea', hp: 100, speed: 5, focus: 1 },
  { id: 'shade', name: 'Shade', blurb: 'Fast, but breaks easily.', color: '#b48cff', hp: 82, speed: 6.3, focus: 1 },
  { id: 'titan', name: 'Titan', blurb: 'Slow, and very hard to drop.', color: '#ffb31a', hp: 130, speed: 4.1, focus: 0.9 },
  { id: 'viper', name: 'Viper', blurb: 'Charges powers twice as fast.', color: '#59e08c', hp: 90, speed: 5.2, focus: 2 },
];

export const SWORDS: Sword[] = [
  { id: 'iron', name: 'Iron Blade', blurb: 'Honest and reliable.', color: '#c8d2e0', damage: 11, length: 1.05, windup: 0.13, active: 0.11, recover: 0.17, knock: 3 },
  { id: 'katana', name: 'Katana', blurb: 'Quick cuts, light hits.', color: '#e8f4ff', damage: 8, length: 1.0, windup: 0.08, active: 0.09, recover: 0.11, knock: 2 },
  { id: 'claymore', name: 'Claymore', blurb: 'Long, slow and brutal.', color: '#9aa7b8', damage: 18, length: 1.5, windup: 0.24, active: 0.13, recover: 0.3, knock: 5.5 },
  { id: 'ember', name: 'Ember Edge', blurb: 'Hot blade, strong finisher.', color: '#ff6a13', damage: 12, length: 1.1, windup: 0.15, active: 0.11, recover: 0.2, knock: 3.6 },
];

export const POWERS: Power[] = [
  { id: 'wave', name: 'Fire Wave', blurb: 'Hurls a burning slash.', cost: 40 },
  { id: 'dash', name: 'Phantom Dash', blurb: 'Cuts straight through them.', cost: 30 },
  { id: 'heal', name: 'Second Wind', blurb: 'Win back some health.', cost: 60 },
];

export type ThemeId = 'embers' | 'dusk' | 'gorge' | 'bells' | 'snow' | 'forge' | 'mirror' | 'throne';

/** How a chapter's enemy fights. Every number climbs through the story. */
export interface Foe {
  name: string;
  character: CharacterId;
  sword: SwordId;
  color: string;
  hpScale: number;
  damageScale: number;
  speedScale: number;
  /** How keen it is to attack, 0 to 1. */
  aggression: number;
  /** Seconds before it reacts to a swing. */
  reaction: number;
  /** Chance it raises its guard against a swing it sees. */
  blockChance: number;
  /** Longest combo it strings together. */
  combo: number;
  /** Which powers it knows. */
  powers: PowerId[];
}

export interface Chapter {
  id: number;
  title: string;
  place: string;
  theme: ThemeId;
  /** Lines before the fight: `hero` is you, anything else is the enemy's name. */
  before: { who: string; line: string }[];
  after: string;
  foe: Foe;
}

export const CHAPTERS: Chapter[] = [
  {
    id: 1,
    title: 'The Burned Village',
    place: 'Your home, on the night it fell',
    theme: 'embers',
    before: [
      { who: 'Narrator', line: 'They came at dusk. By nightfall your village was ash, and Master Oru lay dying.' },
      { who: 'Master Oru', line: 'Kael has the Broken Blade. Take my sword. Stop him.' },
      { who: 'Ash Raider', line: 'One left alive? Kael pays for every head.' },
    ],
    after: 'The raider falls. In his pack: a map, marked with the road to Kael’s throne.',
    foe: { name: 'Ash Raider', character: 'ronin', sword: 'iron', color: '#6d4a3a', hpScale: 0.85, damageScale: 0.6, speedScale: 0.82, aggression: 0.34, reaction: 0.7, blockChance: 0.14, combo: 1, powers: [] },
  },
  {
    id: 2,
    title: 'The Road of Ash',
    place: 'Three days from home',
    theme: 'dusk',
    before: [
      { who: 'Narrator', line: 'The map leads east. A captain of the raiders waits where the road narrows.' },
      { who: 'Captain Brask', line: 'You killed my scout. Now you can tell him why.' },
      { who: 'hero', line: 'Tell me where Kael is, and you live.' },
    ],
    after: 'Dying, Brask laughs: “The Keeper holds the bridge. Nobody crosses.”',
    foe: { name: 'Captain Brask', character: 'titan', sword: 'iron', color: '#7a3030', hpScale: 0.82, damageScale: 0.7, speedScale: 0.85, aggression: 0.42, reaction: 0.6, blockChance: 0.15, combo: 2, powers: [] },
  },
  {
    id: 3,
    title: 'The Keeper’s Bridge',
    place: 'Above the Gorge of Crows',
    theme: 'gorge',
    before: [
      { who: 'The Keeper', line: 'Forty years I have held this bridge. Forty years, none have passed.' },
      { who: 'hero', line: 'I have no quarrel with you. Only with Kael.' },
      { who: 'The Keeper', line: 'Then you should have stayed home. Oh. I forgot. It burned.' },
    ],
    after: 'The old man kneels. “Oru’s student,” he whispers. “Find the Monastery. Learn what the Blade really is.”',
    foe: { name: 'The Keeper', character: 'ronin', sword: 'claymore', color: '#4d5a4a', hpScale: 0.95, damageScale: 0.75, speedScale: 0.85, aggression: 0.48, reaction: 0.5, blockChance: 0.28, combo: 2, powers: [] },
  },
  {
    id: 4,
    title: 'The Monastery of Bells',
    place: 'High in the Silent Peaks',
    theme: 'bells',
    before: [
      { who: 'Narrator', line: 'The bells ring by themselves here. The monks are gone. Only one remains.' },
      { who: 'Brother Sen', line: 'Oru and Kael trained in this hall. They were brothers. Did he not tell you?' },
      { who: 'Brother Sen', line: 'Patience. I will teach you, the way I taught Kael.' },
    ],
    after: 'Sen bows. “The Blade was broken to stop Kael once. He means to make it whole. He needs the shard at the Pass.”',
    foe: { name: 'Brother Sen', character: 'shade', sword: 'katana', color: '#c9a227', hpScale: 1, damageScale: 0.8, speedScale: 0.98, aggression: 0.5, reaction: 0.38, blockChance: 0.55, combo: 3, powers: [] },
  },
  {
    id: 5,
    title: 'The Frozen Pass',
    place: 'Where the shard is buried',
    theme: 'snow',
    before: [
      { who: 'Narrator', line: 'You reach the Pass too late. Kael’s huntress already holds the shard.' },
      { who: 'Ysra the Pale', line: 'Turn back. The cold kills slower than I do.' },
      { who: 'hero', line: 'That shard is the last thing Oru died for.' },
    ],
    after: 'You take the shard, and it burns in your hand. Far below, the Black Forge glows. Kael is rebuilding the Blade.',
    foe: { name: 'Ysra the Pale', character: 'shade', sword: 'katana', color: '#8fd8ff', hpScale: 1.05, damageScale: 0.9, speedScale: 1.12, aggression: 0.64, reaction: 0.3, blockChance: 0.4, combo: 3, powers: ['dash'] },
  },
  {
    id: 6,
    title: 'The Black Forge',
    place: 'Under the mountain',
    theme: 'forge',
    before: [
      { who: 'Grom', line: 'Small one. Grom makes swords. Grom breaks small ones.' },
      { who: 'hero', line: 'You armed the men who burned my home.' },
      { who: 'Grom', line: 'Grom does not ask who pays.' },
    ],
    after: 'The forge goes cold. On the wall, a mirror in a black frame. You see yourself in it, and it smiles.',
    foe: { name: 'Grom the Smith', character: 'titan', sword: 'claymore', color: '#b3461e', hpScale: 1.35, damageScale: 1.05, speedScale: 0.95, aggression: 0.66, reaction: 0.28, blockChance: 0.35, combo: 3, powers: ['wave'] },
  },
  {
    id: 7,
    title: 'The Mirror Hall',
    place: 'Inside the Broken Blade’s shadow',
    theme: 'mirror',
    before: [
      { who: 'Narrator', line: 'The Blade has a power: it shows you what you could become.' },
      { who: 'Your Shadow', line: 'Every life you took to get here made me stronger.' },
      { who: 'hero', line: 'You are not me.' },
      { who: 'Your Shadow', line: 'Not yet.' },
    ],
    after: 'The shadow shatters. Behind it, a stair of ash climbs to the throne.',
    foe: { name: 'Your Shadow', character: 'ronin', sword: 'iron', color: '#20142e', hpScale: 1.15, damageScale: 1.05, speedScale: 1.12, aggression: 0.74, reaction: 0.2, blockChance: 0.5, combo: 3, powers: ['wave', 'dash'] },
  },
  {
    id: 8,
    title: 'The Throne of Ash',
    place: 'The end of the road',
    theme: 'throne',
    before: [
      { who: 'Warlord Kael', line: 'Oru’s last student. He always did send others to finish his work.' },
      { who: 'hero', line: 'You burned my home for a broken sword.' },
      { who: 'Warlord Kael', line: 'Then come and take it. It is whole now.' },
    ],
    after: 'Kael falls. The Blade cracks and goes dark. For the first time in years, the sky over the ash is clear. Master Oru can rest.',
    foe: { name: 'Warlord Kael', character: 'titan', sword: 'ember', color: '#c21f1f', hpScale: 1.7, damageScale: 1.15, speedScale: 1.15, aggression: 0.86, reaction: 0.15, blockChance: 0.6, combo: 3, powers: ['wave', 'dash', 'heal'] },
  },
];

export const characterOf = (id: CharacterId) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
export const swordOf = (id: SwordId) => SWORDS.find((s) => s.id === id) ?? SWORDS[0];
export const powerOf = (id: PowerId) => POWERS.find((p) => p.id === id) ?? POWERS[0];
