import { totalMs } from './attacks';
import { SPECIAL_COST, isSwinging, noCommand, type Command, type Fighter } from './combat';

/**
 * Villains think with a small state machine, and use exactly the same moves,
 * timing and rules as the player: they only decide, never cheat.
 */

export type AIState = 'OBSERVE' | 'APPROACH' | 'STRAFE' | 'ATTACK' | 'BLOCK' | 'PARRY' | 'DODGE' | 'RETREAT' | 'RECOVER';

export type Archetype = 'bruiser' | 'duelist' | 'boss';

/** The handbook's difficulty dimensions. */
export interface AiProfile {
  archetype: Archetype;
  reactionMs: number;
  /** Chance it picks a good answer to what it sees. */
  accuracy: number;
  comboDepth: number;
  /** How readily it blocks, parries and dodges. */
  defence: number;
  /** How much it learns from repeated moves. */
  adaptation: number;
  /** How willing it is to attack while exposed. */
  risk: number;
  preferredRange: number;
  /** Share of health where a boss gets faster and bolder. */
  enragedAt?: number;
}

export class Brain {
  state: AIState = 'OBSERVE';
  private stateMs = 0;
  private sawSwingMs = -1;
  private chain = 0;
  private strafeSide = 1;
  /** How often the player has opened with the same attack. */
  private habit = new Map<string, number>();
  private lastSeen: string | null = null;
  enraged = false;

  constructor(
    private readonly p: AiProfile,
    private readonly rng: () => number = Math.random,
  ) {}

  private go(state: AIState): void {
    this.state = state;
    this.stateMs = 0;
  }

  /** How predictable that opening has become: repeated moves get answered more often. */
  private predicted(id: string): number {
    return Math.min(0.35, (this.habit.get(id) ?? 0) * 0.07 * this.p.adaptation);
  }

  /** Reads the player's swing, after its reaction time, and picks an answer. */
  private react(me: Fighter, foe: Fighter, distance: number): AIState | null {
    const attack = foe.attack;
    const threatened = attack && foe.state === 'STARTUP' && distance < foe.spec.bladeLength + 1.6;
    if (!threatened) {
      this.sawSwingMs = -1;
      this.lastSeen = null;
      return null;
    }
    if (this.lastSeen !== attack.id) {
      this.lastSeen = attack.id;
      this.sawSwingMs = 0;
      this.habit.set(attack.id, (this.habit.get(attack.id) ?? 0) + 1);
    }
    if (this.sawSwingMs < this.p.reactionMs || this.sawSwingMs < 0) return null;
    this.sawSwingMs = -1000;
    if (this.rng() > this.p.defence + this.predicted(attack.id)) return null;
    if (this.rng() > this.p.accuracy) return 'BLOCK';
    if (attack.canBeParried && this.p.archetype !== 'bruiser' && this.rng() < 0.55) return 'PARRY';
    if (me.stamina > 40 && this.rng() < 0.4) return 'DODGE';
    return 'BLOCK';
  }

  /** What it does this step. `facingYaw` points from it towards its foe. */
  think(me: Fighter, foe: Fighter, dtMs: number): Command {
    const cmd = noCommand();
    this.stateMs += dtMs;
    if (this.sawSwingMs >= 0) this.sawSwingMs += dtMs;
    if (me.state === 'DEFEATED' || foe.state === 'DEFEATED') return cmd;

    const dx = foe.x - me.x;
    const dz = foe.z - me.z;
    const distance = Math.hypot(dx, dz) || 0.001;
    const toX = dx / distance;
    const toZ = dz / distance;
    const reach = me.spec.bladeLength + 0.7;

    if (this.p.enragedAt && !this.enraged && me.hp < me.spec.maxHp * this.p.enragedAt) {
      this.enraged = true;
      this.p.reactionMs *= 0.75;
      this.p.risk = Math.min(1, this.p.risk + 0.25);
      me.energy = 100;
    }

    if (me.state === 'HITSTUN') {
      this.go('RECOVER');
      return cmd;
    }
    if (isSwinging(me)) {
      // Follow up while the combo is live, up to its depth.
      if (me.state === 'RECOVERY' && this.chain < this.p.comboDepth && this.rng() < 0.2 + this.p.risk * 0.5) {
        this.chain += 1;
        cmd.light = true;
      }
      return cmd;
    }

    const answer = this.react(me, foe, distance);
    if (answer) this.go(answer);

    switch (this.state) {
      case 'BLOCK':
        cmd.guard = true;
        if (this.stateMs > 380) this.go('OBSERVE');
        return cmd;
      case 'PARRY':
        cmd.guard = true;
        if (this.stateMs > 200) this.go('OBSERVE');
        return cmd;
      case 'DODGE':
        cmd.dodge = true;
        cmd.moveX = -toZ * this.strafeSide;
        cmd.moveZ = toX * this.strafeSide;
        this.go('OBSERVE');
        return cmd;
      case 'RECOVER':
        if (this.stateMs > 160) this.go(this.rng() < 0.3 ? 'RETREAT' : 'OBSERVE');
        return cmd;
      case 'RETREAT':
        cmd.moveX = -toX;
        cmd.moveZ = -toZ;
        if (this.stateMs > 420) this.go('STRAFE');
        return cmd;
      case 'STRAFE':
        cmd.moveX = -toZ * this.strafeSide * 0.7;
        cmd.moveZ = toX * this.strafeSide * 0.7;
        if (this.stateMs > 300 + (1 - this.p.risk) * 500) this.go('OBSERVE');
        return cmd;
      case 'ATTACK': {
        this.chain = 1;
        // An opening: the player just finished swinging, or is out of breath.
        const opening = foe.state === 'RECOVERY' || foe.state === 'HITSTUN';
        if (me.energy >= SPECIAL_COST && (this.p.archetype === 'boss' || this.rng() < 0.25)) cmd.special = true;
        else if (me.stamina > 45 && (opening || this.rng() < 0.22)) cmd.heavy = true;
        else cmd.light = true;
        this.go('OBSERVE');
        return cmd;
      }
      default:
    }

    // OBSERVE and APPROACH: choose what comes next.
    if (distance > Math.max(reach, this.p.preferredRange)) {
      cmd.moveX = toX;
      cmd.moveZ = toZ;
      this.state = 'APPROACH';
      if (this.p.archetype === 'boss' && distance > 4 && me.energy >= SPECIAL_COST) cmd.special = true;
      return cmd;
    }
    if (distance > reach) {
      cmd.moveX = toX;
      cmd.moveZ = toZ;
      this.state = 'APPROACH';
      return cmd;
    }
    this.state = 'OBSERVE';
    if (this.stateMs < 60 + (1 - this.p.risk) * 420) return cmd;
    const opening = foe.state === 'RECOVERY' || foe.state === 'HITSTUN' || foe.stamina < 20;
    if (this.rng() < this.p.risk + (opening ? 0.4 : 0)) this.go('ATTACK');
    else {
      this.strafeSide = this.rng() < 0.5 ? -1 : 1;
      this.go('STRAFE');
    }
    return cmd;
  }
}

/** How long a whole swing keeps a fighter busy, for tests and tuning. */
export const busyMs = (f: Fighter) => (f.attack ? totalMs(f.attack) : 0);
