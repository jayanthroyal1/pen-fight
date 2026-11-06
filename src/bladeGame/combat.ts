import { totalMs, type AttackDefinition, type AttackWeight } from './attacks';
import { bladesMeet, sweepHits, type Blade, type Capsule, type V3 } from './sweep';

/**
 * The fight's single source of truth, with no graphics or physics in it. The
 * combat system decides what hits; physics only moves bodies. Runs at a fixed
 * step, so timing is the same on every phone.
 */

export type CombatState = 'IDLE' | 'STARTUP' | 'ACTIVE' | 'RECOVERY' | 'GUARD' | 'PARRY' | 'DODGE' | 'HITSTUN' | 'DEFEATED';

export const FIXED_MS = 1000 / 60;
const MAX_STAMINA = 100;
const STAMINA_REGEN = 22;
const MAX_GUARD = 100;
const GUARD_REGEN = 16;
const MAX_ENERGY = 100;
export const SPECIAL_COST = 60;
/** Tapping Guard opens a parry this long. */
export const PARRY_MS = 170;
export const DODGE_MS = 440;
const DODGE_SAFE_FROM_MS = 40;
const DODGE_SAFE_TO_MS = 300;
export const DODGE_COST = 24;
const DODGE_SPEED = 8.5;
/** A guard or parry only covers what comes from in front: this many radians either side. */
const GUARD_ARC = 1.3;
const PARRIED_STUN_MS = 760;
const GUARD_BREAK_STUN_MS = 1100;
const CLASH_TOLERANCE = 0.26;
const CLASH_LOCK_MS = 520;
const CLASH_RECOIL_MS = 340;
const COMBO_LINK_MS = 420;
const FIGHTER_RADIUS = 0.36;
const FIGHTER_HEIGHT = 1.75;
const REACH_FROM_BODY = 0.34;
const MIN_GAP = 0.95;
const SEPARATE_RATE = 2.2;

export interface FighterSpec {
  id: string;
  team: number;
  maxHp: number;
  speed: number;
  bladeLength: number;
  moves: AttackDefinition[];
  special: AttackDefinition;
  /** Multiplies the damage this fighter deals, for story difficulty. */
  damageScale?: number;
  /** The whole fighter takes this weight of blow without flinching. */
  poise?: AttackWeight;
}

export interface Fighter {
  spec: FighterSpec;
  hp: number;
  stamina: number;
  guard: number;
  energy: number;
  state: CombatState;
  elapsedMs: number;
  stunMs: number;
  attack: AttackDefinition | null;
  combo: number;
  comboLinkMs: number;
  queued: 'light' | 'heavy' | null;
  /** Who this swing has already hit. */
  hitRegistry: Set<string>;
  x: number;
  z: number;
  /** Where they're facing, in radians. */
  yaw: number;
  /** Knockback still to be applied, in metres a second. */
  pushX: number;
  pushZ: number;
  dodgeX: number;
  dodgeZ: number;
  clashLockMs: number;
  blade: Blade | null;
}

export interface Command {
  /** Wanted direction in the world, up to length 1. */
  moveX: number;
  moveZ: number;
  light: boolean;
  heavy: boolean;
  special: boolean;
  dodge: boolean;
  guard: boolean;
}

export const noCommand = (): Command => ({ moveX: 0, moveZ: 0, light: false, heavy: false, special: false, dodge: false, guard: false });

export type CombatEvent =
  | { type: 'AttackStarted'; by: string; attack: AttackDefinition }
  | { type: 'HitConfirmed'; by: string; on: string; attack: AttackDefinition; damage: number; at: V3 }
  | { type: 'Blocked'; by: string; on: string; at: V3 }
  | { type: 'Parried'; by: string; on: string; at: V3 }
  | { type: 'GuardBroken'; on: string; at: V3 }
  | { type: 'Clash'; at: V3 }
  | { type: 'Dodged'; by: string; on: string }
  | { type: 'CharacterDefeated'; on: string; by: string; at: V3 };

/** One line per blade contact, for tuning the game. */
export interface TelemetryEntry {
  attack: string;
  target: string;
  atMs: number;
  result: HitOutcome;
  damage: number;
}

export type HitOutcome = 'ignored' | 'friendly' | 'dodged' | 'parried' | 'blocked' | 'guard-broken' | 'hit' | 'defeated';

export const newFighter = (spec: FighterSpec, x: number, z: number, yaw: number): Fighter => ({
  spec,
  hp: spec.maxHp,
  stamina: MAX_STAMINA,
  guard: MAX_GUARD,
  energy: 0,
  state: 'IDLE',
  elapsedMs: 0,
  stunMs: 0,
  attack: null,
  combo: 0,
  comboLinkMs: 0,
  queued: null,
  hitRegistry: new Set(),
  x,
  z,
  yaw,
  pushX: 0,
  pushZ: 0,
  dodgeX: 0,
  dodgeZ: 0,
  clashLockMs: 0,
  blade: null,
});

export const isSwinging = (f: Fighter) => f.state === 'STARTUP' || f.state === 'ACTIVE' || f.state === 'RECOVERY';

const rank: Record<AttackWeight, number> = { light: 1, heavy: 2, special: 3 };

/** Where the blade is at a point in a swing: gameplay comes from this data, never from a visual pose. */
export function bladeAt(f: Fighter, attack: AttackDefinition, elapsedMs: number): Blade {
  const k = Math.max(0, Math.min(1, (elapsedMs - attack.startupMs) / attack.activeMs));
  const angle = f.yaw + attack.arc[0] + (attack.arc[1] - attack.arc[0]) * k;
  const y = attack.height[0] + (attack.height[1] - attack.height[0]) * k;
  const dirX = Math.sin(angle);
  const dirZ = Math.cos(angle);
  const root = { x: f.x + dirX * REACH_FROM_BODY, y: y * 0.82 + 0.2, z: f.z + dirZ * REACH_FROM_BODY };
  const length = REACH_FROM_BODY + f.spec.bladeLength;
  return { root, tip: { x: f.x + dirX * length, y, z: f.z + dirZ * length } };
}

export const bodyOf = (f: Fighter): Capsule => ({
  a: { x: f.x, y: FIGHTER_RADIUS, z: f.z },
  b: { x: f.x, y: FIGHTER_HEIGHT - FIGHTER_RADIUS, z: f.z },
  radius: FIGHTER_RADIUS,
});

/** Is `target` turned towards `from`? */
export function facing(target: Fighter, from: { x: number; z: number }): boolean {
  const to = Math.atan2(from.x - target.x, from.z - target.z);
  const off = Math.atan2(Math.sin(to - target.yaw), Math.cos(to - target.yaw));
  return Math.abs(off) <= GUARD_ARC;
}

const isSafe = (f: Fighter) => f.state === 'DODGE' && f.elapsedMs >= DODGE_SAFE_FROM_MS && f.elapsedMs <= DODGE_SAFE_TO_MS;

function startAttack(f: Fighter, attack: AttackDefinition, events: CombatEvent[]): boolean {
  if (f.stamina < attack.staminaCost) return false;
  f.stamina -= attack.staminaCost;
  f.state = 'STARTUP';
  f.attack = attack;
  f.elapsedMs = 0;
  f.hitRegistry.clear();
  f.queued = null;
  f.blade = null;
  events.push({ type: 'AttackStarted', by: f.spec.id, attack });
  return true;
}

function nextLight(f: Fighter): AttackDefinition {
  const lights = f.spec.moves.filter((m) => m.weight === 'light');
  f.combo = f.comboLinkMs > 0 ? (f.combo + 1) % lights.length : 0;
  return lights[f.combo];
}

const heavyOf = (f: Fighter) => f.spec.moves.find((m) => m.weight === 'heavy') ?? f.spec.moves[0];

function toIdle(f: Fighter): void {
  f.state = 'IDLE';
  f.attack = null;
  f.elapsedMs = 0;
  f.blade = null;
}

/** Stops whatever they're doing and stuns them. */
function stun(f: Fighter, ms: number): void {
  f.state = 'HITSTUN';
  f.stunMs = ms;
  f.attack = null;
  f.elapsedMs = 0;
  f.queued = null;
  f.blade = null;
}

/** Moves a fighter's state on by one step. */
export function advance(f: Fighter, cmd: Command, dtMs: number, events: CombatEvent[]): void {
  const s = dtMs / 1000;
  f.clashLockMs = Math.max(0, f.clashLockMs - dtMs);
  f.comboLinkMs = Math.max(0, f.comboLinkMs - dtMs);
  f.stamina = Math.min(MAX_STAMINA, f.stamina + STAMINA_REGEN * s * (isSwinging(f) ? 0.3 : 1));
  f.guard = Math.min(MAX_GUARD, f.guard + GUARD_REGEN * s * (f.state === 'GUARD' ? 0.2 : 1));
  if (f.state === 'DEFEATED') return;

  if (f.state === 'HITSTUN') {
    f.stunMs -= dtMs;
    if (f.stunMs <= 0) toIdle(f);
    return;
  }

  if (f.state === 'DODGE') {
    f.elapsedMs += dtMs;
    if (f.elapsedMs >= DODGE_MS) toIdle(f);
    return;
  }

  if (isSwinging(f) && f.attack) {
    const a = f.attack;
    f.elapsedMs += dtMs;
    if (cmd.light) f.queued = 'light';
    if (cmd.heavy) f.queued = 'heavy';
    f.state = f.elapsedMs < a.startupMs ? 'STARTUP' : f.elapsedMs < a.startupMs + a.activeMs ? 'ACTIVE' : 'RECOVERY';
    const canCancel = a.cancelFromMs !== undefined && f.elapsedMs >= a.cancelFromMs && f.state === 'RECOVERY';
    if (f.queued && canCancel) {
      f.comboLinkMs = COMBO_LINK_MS;
      startAttack(f, f.queued === 'heavy' ? heavyOf(f) : nextLight(f), events);
      return;
    }
    if (f.elapsedMs >= totalMs(a)) {
      const queued = f.queued;
      f.comboLinkMs = COMBO_LINK_MS;
      toIdle(f);
      f.queued = null;
      if (queued) startAttack(f, queued === 'heavy' ? heavyOf(f) : nextLight(f), events);
    }
    return;
  }

  if (cmd.dodge && f.stamina >= DODGE_COST) {
    f.stamina -= DODGE_COST;
    f.state = 'DODGE';
    f.elapsedMs = 0;
    const len = Math.hypot(cmd.moveX, cmd.moveZ);
    // No direction held: step straight back.
    f.dodgeX = len > 0.1 ? cmd.moveX / len : -Math.sin(f.yaw);
    f.dodgeZ = len > 0.1 ? cmd.moveZ / len : -Math.cos(f.yaw);
    return;
  }

  if (cmd.special && f.energy >= SPECIAL_COST) {
    f.energy -= SPECIAL_COST;
    startAttack(f, f.spec.special, events);
    return;
  }
  if (cmd.heavy && startAttack(f, heavyOf(f), events)) return;
  if (cmd.light) {
    startAttack(f, nextLight(f), events);
    return;
  }

  if (cmd.guard && f.guard > 0) {
    if (f.state === 'IDLE') {
      f.state = 'PARRY';
      f.elapsedMs = 0;
    } else {
      f.elapsedMs += dtMs;
      if (f.state === 'PARRY' && f.elapsedMs >= PARRY_MS) f.state = 'GUARD';
    }
    return;
  }
  if (f.state === 'GUARD' || f.state === 'PARRY') toIdle(f);
}

/** How fast a fighter wants to move this step. */
export function wantedVelocity(f: Fighter, cmd: Command): { x: number; z: number } {
  const push = { x: f.pushX, z: f.pushZ };
  if (f.state === 'DEFEATED') return push;
  if (f.state === 'DODGE') return { x: f.dodgeX * DODGE_SPEED + push.x, z: f.dodgeZ * DODGE_SPEED + push.z };
  if (f.state === 'HITSTUN') return push;
  if (f.attack && isSwinging(f)) {
    const a = f.attack;
    const lunging = f.state === 'STARTUP' || f.state === 'ACTIVE';
    const speed = lunging ? a.lunge / ((a.startupMs + a.activeMs) / 1000) : 0;
    return { x: Math.sin(f.yaw) * speed + push.x, z: Math.cos(f.yaw) * speed + push.z };
  }
  const guarded = f.state === 'GUARD' || f.state === 'PARRY' ? 0.3 : 1;
  return { x: cmd.moveX * f.spec.speed * guarded + push.x, z: cmd.moveZ * f.spec.speed * guarded + push.z };
}

/** Two bodies can't share a space: pushes them apart along the line between them. */
export function separate(a: Fighter, b: Fighter): void {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const gap = Math.hypot(dx, dz) || 0.001;
  const overlap = MIN_GAP - gap;
  if (overlap <= 0) return;
  const push = overlap * SEPARATE_RATE;
  a.pushX -= (dx / gap) * push;
  a.pushZ -= (dz / gap) * push;
  b.pushX += (dx / gap) * push;
  b.pushZ += (dz / gap) * push;
}

/** The knockback dying away. */
export function settlePush(f: Fighter, dtMs: number): void {
  const fade = Math.exp(-dtMs / 110);
  f.pushX *= fade;
  f.pushZ *= fade;
}

export interface Contact {
  attacker: Fighter;
  target: Fighter;
  attack: AttackDefinition;
  at: V3;
}

/** The handbook's hit order, one check at a time. */
export function resolveHit({ attacker, target, attack, at }: Contact, nowMs: number, events: CombatEvent[], log: TelemetryEntry[]): HitOutcome {
  const note = (result: HitOutcome, damage = 0) => {
    log.push({ attack: attack.id, target: target.spec.id, atMs: nowMs, result, damage });
    return result;
  };
  // 1. Only a blade in its active window can hit. A thrown slash is already on its way.
  if (attacker.state !== 'ACTIVE' && !attack.projectile) return 'ignored';
  // 2. A valid target, and not one this swing already hit.
  if (target.state === 'DEFEATED' || attacker.hitRegistry.has(target.spec.id)) return 'ignored';
  // 3. Teams.
  if (attacker.spec.team === target.spec.team) return note('friendly');
  attacker.hitRegistry.add(target.spec.id);
  // 4. Dodge invulnerability.
  if (isSafe(target)) {
    events.push({ type: 'Dodged', by: target.spec.id, on: attacker.spec.id });
    return note('dodged');
  }
  const front = facing(target, attacker);
  // 5. Parry window and facing.
  if (target.state === 'PARRY' && front && attack.canBeParried) {
    stun(attacker, PARRIED_STUN_MS);
    target.energy = Math.min(MAX_ENERGY, target.energy + 24);
    toIdle(target);
    events.push({ type: 'Parried', by: target.spec.id, on: attacker.spec.id, at });
    return note('parried');
  }
  const dir = Math.atan2(target.x - attacker.x, target.z - attacker.z);
  const shove = (speed: number) => {
    target.pushX = Math.sin(dir) * speed;
    target.pushZ = Math.cos(dir) * speed;
  };
  // 6. Guard and its direction.
  if ((target.state === 'GUARD' || target.state === 'PARRY') && front && attack.canBeBlocked) {
    target.guard -= attack.guardDamage;
    if (target.guard <= 0) {
      target.guard = 0;
      stun(target, GUARD_BREAK_STUN_MS);
      shove(attack.knockback);
      events.push({ type: 'GuardBroken', on: target.spec.id, at });
      return note('guard-broken');
    }
    shove(attack.knockback * 0.4);
    events.push({ type: 'Blocked', by: target.spec.id, on: attacker.spec.id, at });
    return note('blocked');
  }
  // 7. Armour and poise decide whether it staggers.
  const armour = target.attack?.armour;
  const held = (armour && isSwinging(target) && rank[attack.weight] <= rank[armour]) || (target.spec.poise && rank[attack.weight] <= rank[target.spec.poise]);
  // 8. Damage and its event.
  const damage = attack.damage * (attacker.spec.damageScale ?? 1);
  target.hp = Math.max(0, target.hp - damage);
  attacker.energy = Math.min(MAX_ENERGY, attacker.energy + 9);
  target.energy = Math.min(MAX_ENERGY, target.energy + 6);
  if (target.hp <= 0) {
    target.state = 'DEFEATED';
    target.attack = null;
    target.blade = null;
    shove(attack.knockback * 1.5);
    events.push({ type: 'CharacterDefeated', on: target.spec.id, by: attacker.spec.id, at });
    return note('defeated', damage);
  }
  events.push({ type: 'HitConfirmed', by: attacker.spec.id, on: target.spec.id, attack, damage, at });
  // 9. Movement response.
  if (!held) {
    stun(target, attack.hitStunMs);
    shove(attack.knockback);
  }
  // 10. Telemetry.
  return note('hit', damage);
}

const clashStrength = (f: Fighter) => rank[f.attack?.weight ?? 'light'] * 100 + f.stamina;

/** Both blades live and touching: a clash, not a hit. The stronger swing carries on. */
function resolveClash(a: Fighter, b: Fighter, events: CombatEvent[]): boolean {
  if (a.state !== 'ACTIVE' || b.state !== 'ACTIVE' || !a.blade || !b.blade) return false;
  if (a.clashLockMs > 0 || b.clashLockMs > 0) return false;
  if (a.attack?.projectile || b.attack?.projectile) return false;
  if (!bladesMeet(a.blade, b.blade, CLASH_TOLERANCE + (a.attack?.bladeRadius ?? 0) + (b.attack?.bladeRadius ?? 0))) return false;
  a.clashLockMs = CLASH_LOCK_MS;
  b.clashLockMs = CLASH_LOCK_MS;
  const [strong, weak] = clashStrength(a) >= clashStrength(b) ? [a, b] : [b, a];
  const even = rank[a.attack?.weight ?? 'light'] === rank[b.attack?.weight ?? 'light'];
  const at = { x: (a.x + b.x) / 2, y: 1.3, z: (a.z + b.z) / 2 };
  stun(weak, CLASH_RECOIL_MS);
  if (even) stun(strong, CLASH_RECOIL_MS);
  else strong.hitRegistry.add(weak.spec.id);
  events.push({ type: 'Clash', at });
  return true;
}

export interface Bolt {
  owner: Fighter;
  attack: AttackDefinition;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  leftMs: number;
}

const BOLT_SPEED = 12;
const BOLT_LIFE_MS = 1100;

/** Tracks blades through a step, and turns contact into results. */
export class Duel {
  readonly events: CombatEvent[] = [];
  readonly log: TelemetryEntry[] = [];
  readonly bolts: Bolt[] = [];
  nowMs = 0;

  constructor(readonly fighters: Fighter[]) {}

  private thrown = new Set<AttackDefinition>();

  /** Runs after everyone has moved. */
  resolve(dtMs: number): void {
    this.nowMs += dtMs;
    const [a, b] = this.fighters;
    const before = new Map(this.fighters.map((f) => [f, f.blade]));
    for (const f of this.fighters) {
      if (f.state === 'ACTIVE' && f.attack && !f.attack.projectile) f.blade = bladeAt(f, f.attack, f.elapsedMs);
      else f.blade = null;
      if (f.state === 'ACTIVE' && f.attack?.projectile && !this.thrown.has(f.attack)) {
        this.thrown.add(f.attack);
        this.bolts.push({ owner: f, attack: f.attack, x: f.x, z: f.z, dirX: Math.sin(f.yaw), dirZ: Math.cos(f.yaw), leftMs: BOLT_LIFE_MS });
      }
      if (f.state !== 'ACTIVE' && f.attack) this.thrown.delete(f.attack);
    }
    if (b) resolveClash(a, b, this.events);

    for (const f of this.fighters) {
      const attack = f.attack;
      if (f.state !== 'ACTIVE' || !attack || !f.blade || attack.projectile) continue;
      const was = before.get(f) ?? f.blade;
      for (const target of this.fighters) {
        if (target === f || f.hitRegistry.has(target.spec.id)) continue;
        if (sweepHits(was, f.blade, attack.bladeRadius, bodyOf(target))) {
          resolveHit({ attacker: f, target, attack, at: { x: target.x, y: 1.2, z: target.z } }, this.nowMs, this.events, this.log);
        }
      }
    }

    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i];
      bolt.x += bolt.dirX * BOLT_SPEED * (dtMs / 1000);
      bolt.z += bolt.dirZ * BOLT_SPEED * (dtMs / 1000);
      bolt.leftMs -= dtMs;
      const target = this.fighters.find((f) => f !== bolt.owner && Math.hypot(f.x - bolt.x, f.z - bolt.z) < 0.7);
      if (target) {
        bolt.owner.hitRegistry.delete(target.spec.id);
        resolveHit({ attacker: bolt.owner, target, attack: bolt.attack, at: { x: target.x, y: 1.2, z: target.z } }, this.nowMs, this.events, this.log);
      }
      if (target || bolt.leftMs <= 0) this.bolts.splice(i, 1);
    }
  }
}
