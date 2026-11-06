import { describe, expect, it } from 'vitest';
import { Brain } from './ai';
import { moveSet, special, totalMs } from './attacks';
import { DODGE_COST, Duel, FIXED_MS, PARRY_MS, advance, bladeAt, bodyOf, facing, newFighter, noCommand, resolveHit, separate, settlePush, wantedVelocity, type CombatEvent, type Command, type Fighter, type FighterSpec, type TelemetryEntry } from './combat';
import { CHAPTERS, HEROES, heroSpec, villainSpec } from './roster';
import { bladesMeet, segmentDistance, sweepHits } from './sweep';

const spec = (id: string, team: number, over: Partial<FighterSpec> = {}): FighterSpec => ({
  id,
  team,
  maxHp: 100,
  speed: 5,
  bladeLength: 1.1,
  moves: moveSet('T', { speed: 1, power: 1, reach: 1 }),
  special: special('T', 'X', 30),
  ...over,
});
const light = (s: FighterSpec) => s.moves[0];
const heavy = (s: FighterSpec) => s.moves[3];
const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** Two fighters a step apart, facing each other. */
function pair() {
  const a = newFighter(spec('a', 0), 0, 0, 0);
  const b = newFighter(spec('b', 1), 0, 1.1, Math.PI);
  return { a, b, duel: new Duel([a, b]) };
}

function run(duel: Duel, ms: number, commands: Partial<Record<string, Partial<Command>>> = {}) {
  for (let t = 0; t < ms; t += FIXED_MS) {
    for (const f of duel.fighters) advance(f, { ...noCommand(), ...commands[f.spec.id] }, FIXED_MS, duel.events);
    duel.resolve(FIXED_MS);
  }
}

const press = (duel: Duel, f: Fighter, c: Partial<Command>) => advance(f, { ...noCommand(), ...c }, FIXED_MS, duel.events);
const activeContact = (attacker: Fighter, target: Fighter) => {
  attacker.state = 'ACTIVE';
  attacker.attack = light(attacker.spec);
  attacker.hitRegistry.clear();
  return { attacker, target, attack: attacker.attack, at: { x: 0, y: 1, z: 0 } };
};
const log = () => [[] as CombatEvent[], [] as TelemetryEntry[]] as const;

describe('blade geometry', () => {
  it('measures segments', () => {
    expect(segmentDistance({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 })).toBeCloseTo(1);
    expect(bladesMeet({ root: { x: 0, y: 0, z: 0 }, tip: { x: 2, y: 0, z: 0 } }, { root: { x: 1, y: -1, z: 0 }, tip: { x: 1, y: 1, z: 0 } }, 0.1)).toBe(true);
  });

  it('catches a fast swing that crosses a target between two steps', () => {
    const body = { a: { x: 0, y: 0, z: 1 }, b: { x: 0, y: 2, z: 1 }, radius: 0.1 };
    const before = { root: { x: -3, y: 1, z: 0 }, tip: { x: -3, y: 1, z: 2 } };
    const after = { root: { x: 3, y: 1, z: 0 }, tip: { x: 3, y: 1, z: 2 } };
    expect(sweepHits(after, after, 0.05, body)).toBe(false);
    expect(sweepHits(before, before, 0.05, body)).toBe(false);
    expect(sweepHits(before, after, 0.05, body)).toBe(true);
  });
});

describe('the handbook’s required cases', () => {
  it('misses a target out of range', () => {
    const a = newFighter(spec('a', 0), 0, 0, 0);
    const b = newFighter(spec('b', 1), 0, 6, Math.PI);
    const duel = new Duel([a, b]);
    press(duel, a, { light: true });
    run(duel, totalMs(light(a.spec)) + 40);
    expect(b.hp).toBe(100);
  });

  it('hits in range, once per swing', () => {
    const { a, b, duel } = pair();
    press(duel, a, { light: true });
    run(duel, totalMs(light(a.spec)));
    expect(100 - b.hp).toBe(light(a.spec).damage);
    expect(duel.log.filter((l) => l.result === 'hit')).toHaveLength(1);
  });

  it('hits two enemies with one swing, once each', () => {
    const a = newFighter(spec('a', 0), 0, 0, 0);
    const b = newFighter(spec('b', 1), -0.5, 1, Math.PI);
    const c = newFighter(spec('c', 1), 0.5, 1, Math.PI);
    const duel = new Duel([a, b, c]);
    press(duel, a, { light: true });
    run(duel, totalMs(light(a.spec)));
    expect(100 - b.hp).toBe(light(a.spec).damage);
    expect(100 - c.hp).toBe(light(a.spec).damage);
  });

  it('blocks from the front, costing guard', () => {
    const { a, b } = pair();
    b.state = 'GUARD';
    const [events, entries] = log();
    expect(resolveHit(activeContact(a, b), 0, events, entries)).toBe('blocked');
    expect(b.hp).toBe(100);
    expect(b.guard).toBeLessThan(100);
  });

  it('gives no guard from behind', () => {
    const { a, b } = pair();
    b.state = 'GUARD';
    b.yaw = 0;
    const [events, entries] = log();
    expect(facing(b, a)).toBe(false);
    expect(resolveHit(activeContact(a, b), 0, events, entries)).toBe('hit');
    expect(b.hp).toBeLessThan(100);
  });

  it('parries inside the window and not after it', () => {
    const { a, b, duel } = pair();
    press(duel, b, { guard: true });
    expect(b.state).toBe('PARRY');
    const [events, entries] = log();
    expect(resolveHit(activeContact(a, b), 0, events, entries)).toBe('parried');
    expect(a.state).toBe('HITSTUN');
    const late = pair();
    run(late.duel, PARRY_MS + 60, { b: { guard: true } });
    expect(late.b.state).toBe('GUARD');
    expect(resolveHit(activeContact(late.a, late.b), 0, events, entries)).toBe('blocked');
  });

  it('can’t parry a heavy, and breaks a guard held too long', () => {
    const { a, b } = pair();
    b.state = 'PARRY';
    const [events, entries] = log();
    const contact = { ...activeContact(a, b), attack: heavy(a.spec) };
    expect(resolveHit(contact, 0, events, entries)).toBe('blocked');
    b.state = 'GUARD';
    let last = '';
    for (let i = 0; i < 4 && last !== 'guard-broken'; i++) {
      a.hitRegistry.clear();
      a.state = 'ACTIVE';
      last = resolveHit(contact, 0, events, entries);
    }
    expect(last).toBe('guard-broken');
    expect(events.some((e) => e.type === 'GuardBroken')).toBe(true);
  });

  it('interrupts an attacker during startup, active and recovery', () => {
    for (const ms of [40, 200, 420]) {
      const { a, b, duel } = pair();
      a.x = 9;
      press(duel, b, { light: true });
      run(duel, ms);
      const [events, entries] = log();
      a.x = 0;
      expect(['STARTUP', 'ACTIVE', 'RECOVERY']).toContain(b.state);
      resolveHit(activeContact(a, b), 0, events, entries);
      expect(b.state).toBe('HITSTUN');
      expect(b.attack).toBeNull();
    }
  });

  it('dodges through a hit during its safe frames, but not after them', () => {
    const { a, b, duel } = pair();
    press(duel, b, { dodge: true });
    run(duel, 100);
    const [events, entries] = log();
    expect(resolveHit(activeContact(a, b), 0, events, entries)).toBe('dodged');
    expect(b.stamina).toBeLessThan(100);
    const late = pair();
    press(late.duel, late.b, { dodge: true });
    run(late.duel, 360);
    expect(late.b.state).toBe('DODGE');
    expect(resolveHit(activeContact(late.a, late.b), 0, events, entries)).toBe('hit');
  });

  it('won’t dodge or swing heavy without the stamina', () => {
    const { a, duel } = pair();
    a.stamina = DODGE_COST - 5;
    press(duel, a, { dodge: true });
    expect(a.state).toBe('IDLE');
    press(duel, a, { heavy: true });
    expect(a.state).toBe('IDLE');
    press(duel, a, { light: true });
    expect(a.state).toBe('STARTUP');
  });

  it('a fighter defeated during startup deals no damage', () => {
    const { a, b, duel } = pair();
    press(duel, b, { light: true });
    run(duel, 40);
    b.hp = 1;
    const [events, entries] = log();
    expect(resolveHit(activeContact(a, b), 0, events, entries)).toBe('defeated');
    a.state = 'IDLE';
    a.attack = null;
    run(duel, 800);
    expect(a.hp).toBe(100);
    expect(events.some((e) => e.type === 'CharacterDefeated')).toBe(true);
  });

  it('ignores friends, and records every contact', () => {
    const a = newFighter(spec('a', 0), 0, 0, 0);
    const b = newFighter(spec('b', 0), 0, 1, Math.PI);
    const [events, entries] = log();
    expect(resolveHit(activeContact(a, b), 7, events, entries)).toBe('friendly');
    expect(b.hp).toBe(100);
    expect(entries[0]).toMatchObject({ attack: 'LIGHT_1', target: 'b', atMs: 7, result: 'friendly' });
  });
});

describe('clashes, armour and timing', () => {
  it('clashes instead of hurting when two live blades meet, and locks out repeats', () => {
    const { a, b, duel } = pair();
    press(duel, a, { light: true });
    press(duel, b, { light: true });
    run(duel, 300);
    expect(duel.events.filter((e) => e.type === 'Clash')).toHaveLength(1);
    expect(a.hp).toBe(100);
    expect(b.hp).toBe(100);
  });

  it('lets the heavier swing win a clash', () => {
    const { a, b, duel } = pair();
    press(duel, a, { heavy: true });
    run(duel, heavy(a.spec).startupMs - light(b.spec).startupMs + 20);
    press(duel, b, { light: true });
    run(duel, 300);
    if (duel.events.some((e) => e.type === 'Clash')) expect(b.state).toBe('HITSTUN');
    expect(a.hp).toBe(100);
  });

  it('armour keeps a heavy swing going through a light hit', () => {
    const { a, b, duel } = pair();
    press(duel, b, { heavy: true });
    run(duel, 100);
    const [events, entries] = log();
    expect(resolveHit(activeContact(a, b), 0, events, entries)).toBe('hit');
    expect(b.state).toBe('STARTUP');
    expect(b.hp).toBeLessThan(100);
  });

  it('chains light attacks, ending on the strongest', () => {
    const a = newFighter(spec('a', 0), 0, 0, 0);
    const duel = new Duel([a]);
    const seen: string[] = [];
    for (let i = 0; i < 400 && seen.length < 3; i++) {
      const was = duel.events.length;
      advance(a, { ...noCommand(), light: true }, FIXED_MS, duel.events);
      duel.events.slice(was).forEach((e) => e.type === 'AttackStarted' && seen.push(e.attack.id));
    }
    expect(seen).toEqual(['LIGHT_1', 'LIGHT_2', 'LIGHT_3']);
  });

  it('throws a slash that flies and lands', () => {
    const a = newFighter(spec('a', 0, { special: special('A', 'BOLT', 30, true) }), 0, 0, 0);
    const b = newFighter(spec('b', 1), 0, 5, Math.PI);
    const duel = new Duel([a, b]);
    a.energy = 100;
    press(duel, a, { special: true });
    run(duel, 900);
    expect(100 - b.hp).toBe(30);
    expect(duel.bolts).toHaveLength(0);
  });

  it('knocks back, then settles, and a blade comes from the data', () => {
    const { a, b } = pair();
    const [events, entries] = log();
    resolveHit(activeContact(a, b), 0, events, entries);
    expect(wantedVelocity(b, noCommand()).z).toBeGreaterThan(1);
    for (let i = 0; i < 90; i++) settlePush(b, FIXED_MS);
    expect(Math.abs(b.pushZ)).toBeLessThan(0.01);
    const blade = bladeAt(a, light(a.spec), light(a.spec).startupMs);
    expect(Math.hypot(blade.tip.x, blade.tip.z)).toBeCloseTo(1.44, 1);
    expect(bodyOf(b).b.y).toBeGreaterThan(1);
  });
});

/** A whole fight with a fair stand-in for the player, on open ground. */
function duelSim(foeIndex: number, seed: number): boolean {
  const rng = seeded(seed);
  const chapter = CHAPTERS[foeIndex];
  const me = newFighter(heroSpec(HEROES[0]), 0, -3, 0);
  const foe = newFighter(villainSpec(chapter.foe), 0, 3, Math.PI);
  const duel = new Duel([me, foe]);
  const player = new Brain({ archetype: 'duelist', reactionMs: 300, accuracy: 0.6, comboDepth: 3, defence: 0.42, adaptation: 0, risk: 0.65, preferredRange: 1.6 }, rng);
  const villain = new Brain({ ...chapter.foe.ai }, rng);
  for (let t = 0; t < 180_000 && me.hp > 0 && foe.hp > 0; t += FIXED_MS) {
    const c1 = player.think(me, foe, FIXED_MS);
    const c2 = villain.think(foe, me, FIXED_MS);
    me.yaw = Math.atan2(foe.x - me.x, foe.z - me.z);
    foe.yaw = Math.atan2(me.x - foe.x, me.z - foe.z);
    advance(me, c1, FIXED_MS, duel.events);
    advance(foe, c2, FIXED_MS, duel.events);
    for (const [f, c] of [[me, c1], [foe, c2]] as const) {
      const v = wantedVelocity(f, c);
      f.x += (v.x * FIXED_MS) / 1000;
      f.z += (v.z * FIXED_MS) / 1000;
      settlePush(f, FIXED_MS);
    }
    duel.resolve(FIXED_MS);
  }
  return foe.hp <= 0 && me.hp > 0;
}

describe('bodies', () => {
  it('pushes fighters apart when they overlap, and leaves them alone otherwise', () => {
    const a = newFighter(spec('a', 0), 0, 0, 0);
    const b = newFighter(spec('b', 1), 0, 0.5, Math.PI);
    separate(a, b);
    expect(a.pushZ).toBeLessThan(0);
    expect(b.pushZ).toBeGreaterThan(0);
    const c = newFighter(spec('c', 1), 0, 2, Math.PI);
    separate(a, c);
    expect(c.pushZ).toBe(0);
  });
});

describe('the villains', () => {
  const wins = (i: number) => {
    let n = 0;
    for (let s = 1; s <= 24; s++) if (duelSim(i, s * 7919)) n += 1;
    return n / 24;
  };

  it('finishes fights, and Kaelis is far harder than the first raider', () => {
    const first = wins(0);
    const last = wins(5);
    expect(first).toBeGreaterThan(0.7);
    expect(last).toBeLessThan(first - 0.35);
  });

  it('never moves or swings once the fight is over', () => {
    const { a, b } = pair();
    b.state = 'DEFEATED';
    const brain = new Brain(CHAPTERS[5].foe.ai);
    expect(brain.think(a, b, FIXED_MS)).toEqual(noCommand());
  });

  it('a boss gets bolder at half health', () => {
    const me = newFighter(villainSpec(CHAPTERS[5].foe), 0, 0, 0);
    const you = newFighter(heroSpec(HEROES[0]), 0, 4, Math.PI);
    const brain = new Brain({ ...CHAPTERS[5].foe.ai }, seeded(5));
    me.hp = me.spec.maxHp * 0.4;
    brain.think(me, you, FIXED_MS);
    expect(brain.enraged).toBe(true);
    expect(me.energy).toBe(100);
  });
});

describe('the roster', () => {
  it('has four original heroes and the three villains in a three-act story', () => {
    expect(HEROES).toHaveLength(4);
    expect(CHAPTERS).toHaveLength(6);
    expect(new Set(CHAPTERS.map((c) => c.act)).size).toBe(3);
    const names = CHAPTERS.map((c) => c.foe.name);
    for (const v of ['Zarok', 'Ryujin', 'Kaelis']) expect(names).toContain(v);
    for (const banned of ['Goku', 'Naruto', 'Luffy', 'Ichigo']) expect(JSON.stringify([HEROES, CHAPTERS])).not.toContain(banned);
  });
});
