/**
 * Every move is data, as the handbook asks: timing windows, hit rules and
 * feedback, so a new fighter needs a table, not new combat code.
 */

export type AttackWeight = 'light' | 'heavy' | 'special';

export interface AttackDefinition {
  id: string;
  /** The animation clip this move plays, once a fighter has real clips. */
  animation: string;
  weight: AttackWeight;
  startupMs: number;
  activeMs: number;
  recoveryMs: number;
  damage: number;
  staminaCost: number;
  guardDamage: number;
  hitStunMs: number;
  knockback: number;
  bladeRadius: number;
  /** How far forward the fighter steps during the swing, in metres. */
  lunge: number;
  /** The blade's sweep around the fighter, in radians: 0 is straight ahead, positive is to their left. */
  arc: [number, number];
  /** Its height at each end of the sweep, in metres. */
  height: [number, number];
  canBeBlocked: boolean;
  canBeParried: boolean;
  /** Keeps swinging through hits weaker than this. */
  armour?: AttackWeight;
  /** From this point in the swing, the next attack may cut it short. */
  cancelFromMs?: number;
  /** A thrown slash that flies instead of a blade that swings. */
  projectile?: boolean;
}

interface Style {
  /** Multiplies every time window: below 1 is faster. */
  speed: number;
  /** Multiplies damage. */
  power: number;
  reach: number;
}

/** A fighter's standard set: three light slashes and a heavy. */
export function moveSet(prefix: string, style: Style): AttackDefinition[] {
  const t = (ms: number) => Math.round(ms * style.speed);
  const hit = (n: number) => Math.round(n * style.power);
  const light = (n: number, arc: [number, number], height: [number, number]): AttackDefinition => ({
    id: `LIGHT_${n}`,
    animation: `${prefix}_ATTACK_LIGHT_0${n}`,
    weight: 'light',
    startupMs: t(n === 3 ? 240 : 180),
    activeMs: t(120),
    recoveryMs: t(n === 3 ? 400 : 300),
    damage: hit(n === 3 ? 16 : 10),
    staminaCost: 0,
    guardDamage: hit(n === 3 ? 26 : 14),
    hitStunMs: n === 3 ? 460 : 280,
    knockback: n === 3 ? 4.2 : 2.2,
    bladeRadius: 0.12,
    lunge: n === 3 ? 0.9 : 0.45,
    arc,
    height,
    canBeBlocked: true,
    canBeParried: true,
    cancelFromMs: n === 3 ? undefined : t(240),
  });
  return [
    light(1, [1.5, -1.3], [1.5, 1.0]),
    light(2, [-1.4, 1.4], [0.9, 1.5]),
    light(3, [1.9, -1.7], [1.9, 0.8]),
    {
      id: 'HEAVY',
      animation: `${prefix}_ATTACK_HEAVY_01`,
      weight: 'heavy',
      startupMs: t(430),
      activeMs: t(150),
      recoveryMs: t(520),
      damage: hit(24),
      staminaCost: 28,
      guardDamage: hit(46),
      hitStunMs: 620,
      knockback: 6,
      bladeRadius: 0.16,
      lunge: 1.1,
      arc: [2.1, -2.1],
      height: [2.1, 0.7],
      canBeBlocked: true,
      canBeParried: false,
      armour: 'light',
    },
  ];
}

/** A fighter's signature, paid for with energy. */
export function special(prefix: string, name: string, damage: number, projectile = false): AttackDefinition {
  return {
    id: `SPECIAL_${name}`,
    animation: `${prefix}_FINISHER_01`,
    weight: 'special',
    startupMs: 320,
    activeMs: projectile ? 60 : 200,
    recoveryMs: 480,
    damage,
    staminaCost: 0,
    guardDamage: 60,
    hitStunMs: 720,
    knockback: 7,
    bladeRadius: 0.2,
    lunge: projectile ? 0 : 2.2,
    arc: [2.6, -2.6],
    height: [1.6, 1.0],
    canBeBlocked: true,
    canBeParried: false,
    armour: 'heavy',
    projectile,
  };
}

export const totalMs = (a: AttackDefinition) => a.startupMs + a.activeMs + a.recoveryMs;
