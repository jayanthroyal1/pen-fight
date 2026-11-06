import { powerOf, type Foe, type PowerId, type Sword } from './story';

/**
 * The rules of a sword fight, with no graphics or physics in them: what a
 * fighter is doing, what a hit does, and how the computer decides. The scene
 * supplies contact (did the blade touch them?) and the rest happens here.
 */

export const MAX_ENERGY = 100;
const MAX_GUARD = 100;
const GUARD_REGEN = 18;
/** Raising a guard this soon before the hit is a parry. */
export const PARRY_WINDOW = 0.16;
/** How long after a swing the next one still counts as the combo. */
const COMBO_WINDOW = 0.34;
const COMBO_STEPS = 3;
const FINISHER = 1.7;
const BLOCKED_DAMAGE = 0.12;
const STUN_S = 0.3;
const FINISHER_STUN_S = 0.55;
const PARRIED_STUN_S = 0.7;
const GUARD_BROKEN_STUN_S = 1;
const DASH_S = 0.28;
const HEAL_SHARE = 0.28;
const ENERGY_ON_HIT = 11;
const ENERGY_ON_HURT = 7;
const ENERGY_ON_PARRY = 22;

export type Action = 'free' | 'attack' | 'stun' | 'dash' | 'ko';

export interface Fighter {
  hp: number;
  maxHp: number;
  energy: number;
  guard: number;
  action: Action;
  /** Seconds into the current action, or left of a stun. */
  t: number;
  stun: number;
  combo: number;
  comboLeft: number;
  /** This swing has already landed. */
  landed: boolean;
  blocking: boolean;
  blockedFor: number;
  focus: number;
  damageScale: number;
  /** An attack pressed during a swing, waiting for its end. */
  queued: boolean;
}

export interface Input {
  /** -1 to 1. */
  move: number;
  attack: boolean;
  block: boolean;
  jump: boolean;
  power: PowerId | null;
}

export const idle = (): Input => ({ move: 0, attack: false, block: false, jump: false, power: null });

export const newFighter = (maxHp: number, focus = 1, damageScale = 1): Fighter => ({
  hp: maxHp,
  maxHp,
  energy: 0,
  guard: MAX_GUARD,
  action: 'free',
  t: 0,
  stun: 0,
  combo: 0,
  comboLeft: 0,
  landed: false,
  blocking: false,
  blockedFor: 0,
  focus,
  damageScale,
  queued: false,
});

export const swingTime = (s: Sword) => s.windup + s.active + s.recover;

/** The finisher takes a little longer to come around. */
const windupOf = (f: Fighter, s: Sword) => (f.combo === COMBO_STEPS - 1 ? s.windup * 1.35 : s.windup);

export const isDangerous = (f: Fighter, s: Sword) => {
  if (f.action !== 'attack' || f.landed) return false;
  const w = windupOf(f, s);
  return f.t >= w && f.t < w + s.active;
};

/** Winding up: what an alert opponent reacts to. */
export const isWindingUp = (f: Fighter, s: Sword) => f.action === 'attack' && f.t < windupOf(f, s);

/** How far through the swing it is, 0 to 1, for the animation. */
export const swingProgress = (f: Fighter, s: Sword) => {
  const w = windupOf(f, s);
  if (f.t < w) return (f.t / w) * 0.3;
  if (f.t < w + s.active) return 0.3 + ((f.t - w) / s.active) * 0.45;
  return Math.min(1, 0.75 + ((f.t - w - s.active) / s.recover) * 0.25);
};

export type FightEvent = { type: 'swing'; combo: number } | { type: 'power'; power: PowerId } | { type: 'heal' };

function startSwing(f: Fighter): FightEvent {
  f.combo = f.comboLeft > 0 ? (f.combo + 1) % COMBO_STEPS : 0;
  f.action = 'attack';
  f.t = 0;
  f.landed = false;
  f.queued = false;
  f.blocking = false;
  return { type: 'swing', combo: f.combo };
}

/** Moves a fighter on by `dt`. Returns what they just did. */
export function tick(f: Fighter, input: Input, sword: Sword, dt: number): FightEvent[] {
  const events: FightEvent[] = [];
  f.comboLeft = Math.max(0, f.comboLeft - dt);
  f.guard = Math.min(MAX_GUARD, f.guard + GUARD_REGEN * dt * (f.blocking ? 0.2 : 1));
  if (f.action === 'ko') return events;

  if (f.action === 'stun') {
    f.stun -= dt;
    f.blocking = false;
    if (f.stun <= 0) f.action = 'free';
    return events;
  }

  if (f.action === 'dash') {
    f.t += dt;
    if (f.t >= DASH_S) f.action = 'free';
    return events;
  }

  if (f.action === 'attack') {
    f.t += dt;
    if (input.attack) f.queued = true;
    if (f.t >= windupOf(f, sword) + sword.active + sword.recover) {
      f.action = 'free';
      f.comboLeft = COMBO_WINDOW;
      if (f.queued) events.push(startSwing(f));
    }
    return events;
  }

  if (input.power) {
    const { cost, id } = powerOf(input.power);
    if (f.energy >= cost) {
      f.energy -= cost;
      f.blocking = false;
      if (id === 'heal') {
        f.hp = Math.min(f.maxHp, f.hp + f.maxHp * HEAL_SHARE);
        events.push({ type: 'heal' });
      } else if (id === 'dash') {
        f.action = 'dash';
        f.t = 0;
        f.landed = false;
      }
      events.push({ type: 'power', power: id });
      return events;
    }
  }

  if (input.attack) {
    events.push(startSwing(f));
    return events;
  }

  const raising = input.block && f.guard > 0;
  f.blockedFor = raising ? (f.blocking ? f.blockedFor + dt : 0) : 0;
  f.blocking = raising;
  return events;
}

export type HitResult = { kind: 'none' } | { kind: 'hit' | 'block' | 'parry' | 'guard-break'; damage: number; knock: number; finisher: boolean; ko: boolean };

/** A blade (or a power) reaches `def`. `facing` says the defender is turned towards it. */
export function strike(att: Fighter, def: Fighter, damage: number, knock: number, facing: boolean): HitResult {
  if (def.action === 'ko' || def.action === 'dash') return { kind: 'none' };
  att.landed = true;
  const finisher = att.action === 'attack' && att.combo === COMBO_STEPS - 1;
  const raw = damage * att.damageScale * (finisher ? FINISHER : 1);
  const push = knock * (finisher ? 1.7 : 1);

  if (def.blocking && facing) {
    if (def.blockedFor <= PARRY_WINDOW) {
      att.action = 'stun';
      att.stun = PARRIED_STUN_S;
      att.comboLeft = 0;
      def.energy = Math.min(MAX_ENERGY, def.energy + ENERGY_ON_PARRY * def.focus);
      return { kind: 'parry', damage: 0, knock: push * 0.5, finisher, ko: false };
    }
    def.guard -= raw * 3.4;
    const chip = raw * BLOCKED_DAMAGE;
    def.hp = Math.max(1, def.hp - chip);
    if (def.guard <= 0) {
      def.guard = 0;
      def.blocking = false;
      def.action = 'stun';
      def.stun = GUARD_BROKEN_STUN_S;
      return { kind: 'guard-break', damage: chip, knock: push, finisher, ko: false };
    }
    return { kind: 'block', damage: chip, knock: push * 0.35, finisher, ko: false };
  }

  def.hp = Math.max(0, def.hp - raw);
  att.energy = Math.min(MAX_ENERGY, att.energy + ENERGY_ON_HIT * att.focus);
  def.energy = Math.min(MAX_ENERGY, def.energy + ENERGY_ON_HURT * def.focus);
  def.blocking = false;
  const ko = def.hp <= 0;
  if (ko) def.action = 'ko';
  else {
    def.action = 'stun';
    def.stun = finisher ? FINISHER_STUN_S : STUN_S;
  }
  return { kind: 'hit', damage: raw, knock: push, finisher, ko };
}

export interface Brain {
  think: number;
  /** Seconds it keeps its guard up. */
  guarding: number;
  /** Seconds until it reacts to the swing it just saw. */
  seen: number;
  backing: number;
  chain: number;
}

export const newBrain = (): Brain => ({ think: 0, guarding: 0, seen: -1, backing: 0, chain: 0 });

/** What the computer does this moment. `gap` is the signed distance to its foe. */
export function decide(me: Fighter, foe: Fighter, gap: number, mySword: Sword, foeSword: Sword, profile: Foe, brain: Brain, dt: number, rng: () => number = Math.random): Input {
  const input = idle();
  const dir = Math.sign(gap) || 1;
  const distance = Math.abs(gap);
  const reach = mySword.length + 0.6;
  brain.think -= dt;
  brain.guarding -= dt;
  brain.backing -= dt;

  // Sees a swing coming, after its reaction time, and may raise its guard.
  if (isWindingUp(foe, foeSword) && distance < foeSword.length + 1.2 && brain.seen < 0) brain.seen = profile.reaction;
  if (brain.seen >= 0) {
    brain.seen -= dt;
    if (brain.seen < 0 && rng() < profile.blockChance) brain.guarding = 0.35 + rng() * 0.25;
  }
  if (brain.guarding > 0) {
    input.block = true;
    return input;
  }

  // Powers, when it knows them and can afford them.
  if (profile.powers.length && brain.think <= 0) {
    if (profile.powers.includes('heal') && me.hp < me.maxHp * 0.4 && me.energy >= powerOf('heal').cost) input.power = 'heal';
    else if (profile.powers.includes('wave') && distance > 3 && me.energy >= powerOf('wave').cost) input.power = 'wave';
    else if (profile.powers.includes('dash') && distance > 2 && distance < 5 && me.energy >= powerOf('dash').cost) input.power = 'dash';
    if (input.power) {
      brain.think = 0.5;
      return input;
    }
  }

  if (brain.backing > 0) {
    input.move = -dir;
    return input;
  }

  if (distance > reach) {
    input.move = dir * (0.55 + profile.aggression * 0.45);
    return input;
  }

  if (brain.think <= 0) {
    brain.think = 0.08 + (1 - profile.aggression) * 0.5 * (0.5 + rng());
    if (rng() < profile.aggression) {
      input.attack = true;
      brain.chain += 1;
      if (brain.chain >= profile.combo) {
        brain.chain = 0;
        brain.backing = 0.25 + rng() * 0.3 * (1 - profile.aggression);
      }
    } else if (rng() < 0.35) {
      brain.backing = 0.2 + rng() * 0.3;
    }
  }
  return input;
}
