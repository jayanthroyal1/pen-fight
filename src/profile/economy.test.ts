import { describe, expect, it } from 'vitest';
import { PEN_MODELS, currentPenId, penModel } from '../game/pens';
import { POWERS } from '../game/powers';
import { ROOMS, room } from '../game/rooms';
import {
  START_PENS,
  TESTER_RUPEES,
  MAX_PENS,
  StoreError,
  applyLoss,
  applyWin,
  boostCount,
  buyBoost,
  buyPen,
  buyPower,
  eligiblePens,
  entryProblem,
  newProfile,
  newTesterProfile,
  ownPen,
  pocketMoney,
  spendBoost,
  testerTopUp,
  type Profile,
} from './economy';

function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

describe('catalog', () => {
  it('sells 20 pens across five levels, some pink or rose', () => {
    expect(PEN_MODELS).toHaveLength(20);
    for (const level of [1, 2, 3, 4, 5]) expect(PEN_MODELS.filter((m) => m.level === level)).toHaveLength(4);
    expect(PEN_MODELS.filter((m) => /pink|rose|blossom|sakura|flamingo/i.test(m.name)).length).toBeGreaterThanOrEqual(4);
    expect(Math.min(...PEN_MODELS.map((m) => m.price))).toBe(50);
    expect(Math.max(...PEN_MODELS.map((m) => m.price))).toBe(1500);
  });
});

describe('newProfile', () => {
  it('starts with ₹100 and three different pens', () => {
    const p = newProfile('Ravi', seeded(1));
    expect(p.rupees).toBe(100);
    expect(p.pens).toHaveLength(3);
    expect(new Set(p.pens.map((x) => x.model)).size).toBe(3);
    expect(p.pens.filter((x) => penModel(x.model).level === 2)).toHaveLength(1);
  });

  it('never deals a second player the same set of pens', () => {
    const rng = seeded(9);
    const first = newProfile('A', rng);
    for (let i = 0; i < 30; i++) {
      const other = newProfile('B', rng, [first.pens.map((x) => x.model)]);
      expect(other.pens.map((x) => x.model).sort()).not.toEqual(first.pens.map((x) => x.model).sort());
    }
  });
});

describe('pocketMoney', () => {
  const broke: Profile = { ...newProfile('A', seeded(2)), rupees: 10 };

  it('tops a broke player up to ₹50 once a day', () => {
    const first = pocketMoney(broke, '2026-11-03');
    expect(first.profile.rupees).toBe(50);
    expect(pocketMoney(first.profile, '2026-11-03').rupees).toBe(0);
    expect(pocketMoney({ ...first.profile, rupees: 5 }, '2026-11-04').profile.rupees).toBe(50);
  });

  it('gives a player with no pens one starter pen', () => {
    const r = pocketMoney({ ...broke, rupees: 80, pens: [] }, '2026-11-03', seeded(3));
    expect(r.profile.pens).toHaveLength(1);
    expect(penModel(r.profile.pens[0].model).level).toBe(1);
    expect(r.profile.rupees).toBe(80);
  });

  it('gives nothing to a player who is fine', () => {
    const fine = newProfile('A', seeded(4));
    expect(pocketMoney(fine, '2026-11-03').profile).toBe(fine);
  });
});

describe('rooms', () => {
  it('lets pens in by level and checks the bet', () => {
    const p: Profile = { ...newProfile('A', seeded(5)), rupees: 60 };
    expect(entryProblem(p, room('public'))).toBeNull();
    expect(entryProblem(p, room('private'))).toBeNull();
    expect(entryProblem(p, room('cbse'))).toMatch(/₹75/);
    expect(eligiblePens(p, room('private')).every((x) => penModel(x.model).level >= 2)).toBe(true);
    expect(entryProblem({ ...p, rupees: 500 }, room('cbse'))).toMatch(/level 3\+/);
    expect(ROOMS.map((r) => r.bet)).toEqual([25, 50, 75, 100]);
  });
});

describe('store', () => {
  it('buys a pen into a free slot', () => {
    const p: Profile = { ...newProfile('A', seeded(6)), rupees: 200 };
    const after = buyPen(p, 'clear-grip');
    expect(after.rupees).toBe(50);
    expect(after.pens).toHaveLength(4);
  });

  it('refuses when broke or the pencil box is full', () => {
    const p = newProfile('A', seeded(7));
    expect(() => buyPen(p, 'gold-dot')).toThrow(StoreError);
    const full: Profile = { ...p, rupees: 9999, pens: Array.from({ length: MAX_PENS }, () => ownPen('inkmax-aqua')) };
    expect(() => buyPen(full, 'inkmax-aqua')).toThrow(/full/);
  });

  it('applies a bought power to the chosen pen', () => {
    const p: Profile = { ...newProfile('A', seeded(8)), rupees: 2000 };
    const target = p.pens[1].uid;
    const after = buyPower(p, 'hanuman', target);
    expect(after.rupees).toBe(500);
    expect(after.pens.find((x) => x.uid === target)?.power).toBe('hanuman');
    expect(after.pens.filter((x) => x.power).length).toBe(1);
  });
});

describe('settling a bet', () => {
  const winner: Profile = { ...newProfile('W', seeded(10)), rupees: 100 };
  const loser: Profile = { ...newProfile('L', seeded(11)), rupees: 100 };
  const prize = { ...loser.pens[0], power: 'giant' as const };

  it('moves the bet and the pen, power and all', () => {
    const w = applyWin(winner, 25, prize, null);
    const l = applyLoss(loser, 25, prize.uid, false);
    expect(w.rupees).toBe(125);
    expect(w.pens.at(-1)).toEqual(prize);
    expect(l.rupees).toBe(75);
    expect(l.pens.some((x) => x.uid === prize.uid)).toBe(false);
  });

  it('with a full box: swap, break or give back', () => {
    const full: Profile = { ...winner, pens: Array.from({ length: MAX_PENS }, () => ownPen('inkmax-aqua')) };
    expect(() => applyWin(full, 25, prize, null)).toThrow();
    const swapped = applyWin(full, 25, prize, { kind: 'swap', dropUid: full.pens[2].uid });
    expect(swapped.pens).toHaveLength(MAX_PENS);
    expect(swapped.pens.some((x) => x.uid === prize.uid)).toBe(true);
    expect(applyWin(full, 25, prize, { kind: 'break' }).pens).toHaveLength(MAX_PENS);
    expect(applyLoss(loser, 25, prize.uid, true).pens).toHaveLength(3);
  });
});

describe('test account', () => {
  it('can buy every pen and power, and is topped back up', () => {
    let p = newTesterProfile('jayanth', seeded(12));
    expect(p.tester).toBe(true);
    for (const m of PEN_MODELS) p = testerTopUp(buyPen(p, m.id));
    expect(p.pens).toHaveLength(START_PENS + PEN_MODELS.length);
    for (const pw of POWERS) p = testerTopUp(buyPower(p, pw.id, p.pens[0].uid));
    expect(p.rupees).toBe(TESTER_RUPEES);
  });

  it('never tops up a normal player', () => {
    const p = newProfile('A', seeded(13));
    expect(testerTopUp(p)).toBe(p);
  });
});

describe('pens from earlier versions', () => {
  it('become the matching new pen, and unknown ones a starter pen', () => {
    expect(currentPenId('reynolds')).toBe('clear-grip');
    expect(currentPenId('retro51')).toBe('exec-gold-clip');
    expect(currentPenId('click-sky')).toBe('click-sky');
    expect(currentPenId('laser-pen')).toBe('inkmax-aqua');
  });
});

describe('super powers in the store', () => {
  it('buys, counts and uses up super powers', () => {
    let p = { ...newProfile('Ravi', seeded(5)), rupees: 100 };
    p = buyBoost(p, 'lightning');
    p = buyBoost(p, 'lightning');
    expect(p.rupees).toBe(50);
    expect(boostCount(p, 'lightning')).toBe(2);
    expect(() => buyBoost(p, 'wall')).toThrow(/costs ₹75/);
    p = spendBoost(p, 'lightning');
    expect(boostCount(p, 'lightning')).toBe(1);
    expect(spendBoost(spendBoost(p, 'lightning'), 'lightning').boosts?.lightning).toBe(0);
  });

  it('caps how many of one a player can hold', () => {
    let p = { ...newProfile('Ravi', seeded(5)), rupees: 10_000 };
    for (let i = 0; i < 9; i++) p = buyBoost(p, 'ice');
    expect(() => buyBoost(p, 'ice')).toThrow(/already hold 9/);
  });
});
