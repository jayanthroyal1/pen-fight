import { describe, expect, it } from 'vitest';
import { MAX_ENERGY, PARRY_WINDOW, decide, idle, isDangerous, newBrain, newFighter, strike, swingProgress, tick, type Fighter } from './combat';
import { CHAPTERS, CHARACTERS, POWERS, SWORDS, swordOf, type Foe, type Sword } from './story';

const DT = 1 / 60;
const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const iron = swordOf('iron');

/** Runs a fighter until `until`, pressing nothing. */
function run(f: Fighter, sword: Sword, until: (f: Fighter) => boolean) {
  for (let i = 0; i < 300 && !until(f); i++) tick(f, idle(), sword, DT);
}

describe('swinging', () => {
  it('winds up, is dangerous, then recovers', () => {
    const f = newFighter(100);
    tick(f, { ...idle(), attack: true }, iron, DT);
    expect(f.action).toBe('attack');
    expect(isDangerous(f, iron)).toBe(false);
    run(f, iron, (x) => isDangerous(x, iron));
    expect(isDangerous(f, iron)).toBe(true);
    expect(swingProgress(f, iron)).toBeGreaterThan(0.25);
    run(f, iron, (x) => x.action === 'free');
    expect(f.comboLeft).toBeGreaterThan(0);
  });

  it('chains a three-hit combo, with a stronger finisher', () => {
    const f = newFighter(100);
    const seen: number[] = [];
    for (let i = 0; i < 400 && seen.length < 3; i++) {
      for (const e of tick(f, { ...idle(), attack: true }, iron, DT)) if (e.type === 'swing') seen.push(e.combo);
    }
    expect(seen).toEqual([0, 1, 2]);
    const foe = newFighter(100);
    const hit = strike(f, foe, 10, 3, false);
    expect(hit.kind === 'hit' && hit.finisher).toBe(true);
    expect(foe.hp).toBe(83);
  });

  it('lands only once a swing', () => {
    const f = newFighter(100);
    tick(f, { ...idle(), attack: true }, iron, DT);
    run(f, iron, (x) => isDangerous(x, iron));
    strike(f, newFighter(100), 10, 3, false);
    expect(isDangerous(f, iron)).toBe(false);
  });
});

describe('defending', () => {
  const blocker = (held: number) => {
    const d = newFighter(100);
    d.blocking = true;
    d.blockedFor = held;
    return d;
  };

  it('stuns the attacker on a parry, and pays the defender energy', () => {
    const a = newFighter(100);
    const d = blocker(PARRY_WINDOW / 2);
    expect(strike(a, d, 10, 3, true).kind).toBe('parry');
    expect(a.action).toBe('stun');
    expect(d.hp).toBe(100);
    expect(d.energy).toBeGreaterThan(0);
  });

  it('takes a little through a held guard, and none of it can kill', () => {
    const d = blocker(1);
    expect(strike(newFighter(100), d, 10, 3, true).kind).toBe('block');
    expect(d.hp).toBeGreaterThan(98);
    d.hp = 1;
    strike(newFighter(100), d, 10, 3, true);
    expect(d.hp).toBe(1);
  });

  it('breaks a guard that is held too long', () => {
    const d = blocker(1);
    let last = '';
    for (let i = 0; i < 6 && last !== 'guard-break'; i++) last = strike(newFighter(100), d, 11, 3, true).kind;
    expect(last).toBe('guard-break');
    expect(d.action).toBe('stun');
  });

  it('gives no protection from behind', () => {
    const d = blocker(1);
    expect(strike(newFighter(100), d, 10, 3, false).kind).toBe('hit');
  });

  it('knocks out at zero', () => {
    const d = newFighter(5);
    const hit = strike(newFighter(100), d, 10, 3, false);
    expect(hit.kind === 'hit' && hit.ko).toBe(true);
    expect(d.action).toBe('ko');
    expect(strike(newFighter(100), d, 10, 3, false).kind).toBe('none');
  });
});

describe('powers', () => {
  it('cost energy, and do nothing without it', () => {
    const f = newFighter(100);
    expect(tick(f, { ...idle(), power: 'wave' }, iron, DT)).toEqual([]);
    f.energy = MAX_ENERGY;
    expect(tick(f, { ...idle(), power: 'wave' }, iron, DT)).toEqual([{ type: 'power', power: 'wave' }]);
    expect(f.energy).toBe(60);
  });

  it('heal, and dash leaves the fighter untouchable', () => {
    const f = newFighter(100);
    f.hp = 40;
    f.energy = 60;
    tick(f, { ...idle(), power: 'heal' }, iron, DT);
    expect(f.hp).toBeCloseTo(68);
    f.energy = 30;
    tick(f, { ...idle(), power: 'dash' }, iron, DT);
    expect(f.action).toBe('dash');
    expect(strike(newFighter(100), f, 10, 3, false).kind).toBe('none');
  });
});

/** A whole fight on a line, with a fair stand-in for the player, returning who won. */
function duel(foe: Foe, seed: number): boolean {
  const rng = seeded(seed);
  const hero = newFighter(100);
  const enemySword = swordOf(foe.sword);
  const enemy = newFighter(100 * foe.hpScale, 1, foe.damageScale);
  const player: Foe = { ...foe, aggression: 0.62, reaction: 0.34, blockChance: 0.34, combo: 3, powers: [], speedScale: 1 };
  const a = newBrain();
  const b = newBrain();
  let x = -3;
  let y = 3;
  for (let i = 0; i < 60 * 150 && hero.hp > 0 && enemy.hp > 0; i++) {
    const heroIn = decide(hero, enemy, y - x, iron, enemySword, player, a, DT, rng);
    const foeIn = decide(enemy, hero, x - y, enemySword, iron, foe, b, DT, rng);
    tick(hero, heroIn, iron, DT);
    tick(enemy, foeIn, enemySword, DT);
    if (hero.action === 'free' && !hero.blocking) x += heroIn.move * 5 * DT;
    if (enemy.action === 'free' && !enemy.blocking) y += foeIn.move * 5 * foe.speedScale * DT;
    if (y - x < 0.4) y = x + 0.4;
    if (isDangerous(hero, iron) && y - x < iron.length + 0.7) strike(hero, enemy, iron.damage, iron.knock, true);
    if (isDangerous(enemy, enemySword) && y - x < enemySword.length + 0.7) strike(enemy, hero, enemySword.damage, enemySword.knock, true);
  }
  return enemy.hp <= 0;
}

describe('the story', () => {
  it('has eight chapters, in order, each with a fight and a next step', () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const c of CHAPTERS) {
      expect(c.before.length, c.title).toBeGreaterThanOrEqual(3);
      expect(c.after).toBeTruthy();
    }
  });

  it('gets harder in every way that matters', () => {
    for (let i = 1; i < CHAPTERS.length; i++) {
      const [was, now] = [CHAPTERS[i - 1].foe, CHAPTERS[i].foe];
      expect(now.aggression, now.name).toBeGreaterThan(was.aggression);
      expect(now.reaction, now.name).toBeLessThan(was.reaction);
      expect(now.damageScale, now.name).toBeGreaterThanOrEqual(was.damageScale);
      expect(now.hpScale, now.name).toBeGreaterThanOrEqual(was.hpScale - 0.21);
    }
  });

  it('is really harder to win: the same player does worse near the end', () => {
    const wins = (c: number) => {
      let n = 0;
      for (let seed = 1; seed <= 40; seed++) if (duel(CHAPTERS[c].foe, seed * 7919)) n += 1;
      return n / 40;
    };
    const early = wins(0);
    const late = wins(7);
    expect(early).toBeGreaterThan(0.7);
    expect(late).toBeLessThan(early - 0.3);
  });

  it('offers a real choice of fighters, swords and powers', () => {
    expect(CHARACTERS.length).toBe(4);
    expect(SWORDS.length).toBe(4);
    expect(POWERS.length).toBe(3);
    expect(new Set(SWORDS.map((s) => s.damage)).size).toBe(4);
  });
});
