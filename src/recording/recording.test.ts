import { describe, expect, it } from 'vitest';
import { newMatch, resolveShot } from '../game/rules';
import { MatchRecorder, SAMPLE_EVERY } from './recorder';
import { LocalMatchStore, MAX_STORED_MATCHES, MemoryMatchStore } from './store';
import type { MatchRecord } from './types';

class FakeStorage implements Storage {
  private data = new Map<string, string>();
  constructor(private quota = Infinity) {}
  get length() {
    return this.data.size;
  }
  clear() {
    this.data.clear();
  }
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
  setItem(k: string, v: string) {
    const used = [...this.data.entries()].reduce((n, [key, val]) => (key === k ? n : n + val.length), 0);
    if (used + v.length > this.quota) throw new Error('QuotaExceededError');
    this.data.set(k, v);
  }
}

const players: MatchRecord['players'] = [
  { name: 'You', model: 'retro51' },
  { name: 'Computer', model: 'ballpoint' },
];

describe('MatchRecorder', () => {
  it('records the flick, sampled movement and outcome of a shot', async () => {
    const store = new MemoryMatchStore();
    const rec = new MatchRecorder(store, { mode: 'ai', players, me: 0 });
    const state = newMatch([{ model: 'retro51', power: null }, { model: 'ballpoint', power: null }]);
    rec.beginShot(state, { along: 10, ix: 500, iy: -20 });
    for (let i = 0; i < SAMPLE_EVERY * 4; i++) {
      rec.step(state.pens, i === 2 ? [{ kind: 'pens', strength: 0.5 }] : [], 1000 / 60);
    }
    await rec.endShot(resolveShot(state, 0));

    const saved = await store.get(rec.id);
    expect(saved?.shots).toHaveLength(1);
    const shot = saved!.shots[0];
    expect(shot.model).toBe('retro51');
    expect(shot.flick).toEqual({ along: 10, ix: 500, iy: -20 });
    expect(shot.frames).toHaveLength(4);
    expect(shot.impacts).toEqual([{ t: 50, kind: 'pens', strength: 0.5 }]);
    expect(shot.outcome?.roundWinner).toBeNull();
    expect(shot.after).not.toBeNull();
  });
});

describe('LocalMatchStore', () => {
  const record = (id: string): MatchRecord => ({
    id,
    version: 1,
    mode: 'local',
    startedAt: '',
    updatedAt: '',
    endedAt: null,
    players,
    me: null,
    shots: [],
    winner: null,
    scores: [0, 0],
  });

  it('saves, replaces and lists newest first', async () => {
    const store = new LocalMatchStore(new FakeStorage());
    await store.save(record('a'));
    await store.save(record('b'));
    await store.save({ ...record('a'), scores: [1, 0] });
    const list = await store.list();
    expect(list.map((r) => r.id)).toEqual(['a', 'b']);
    expect(list[0].scores).toEqual([1, 0]);
  });

  it(`keeps at most ${MAX_STORED_MATCHES} matches`, async () => {
    const store = new LocalMatchStore(new FakeStorage());
    for (let i = 0; i < MAX_STORED_MATCHES + 5; i++) await store.save(record(`m${i}`));
    const list = await store.list();
    expect(list).toHaveLength(MAX_STORED_MATCHES);
    expect(await store.get('m0')).toBeNull();
  });

  it('drops the oldest matches when storage is full', async () => {
    const size = JSON.stringify(record('m0')).length;
    const store = new LocalMatchStore(new FakeStorage(size * 3 + 200));
    for (let i = 0; i < 6; i++) await store.save(record(`m${i}`));
    expect(await store.get('m5')).not.toBeNull();
    expect(await store.get('m0')).toBeNull();
  });
});
