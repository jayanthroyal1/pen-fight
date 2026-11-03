import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startRelay } from './relay.js';

let relay;
const clients = [];

beforeEach(async () => {
  relay = await startRelay(0);
});

afterEach(async () => {
  for (const c of clients.splice(0)) c.terminate();
  await relay.close();
});

/** A test player: sends messages and waits for the next one of a type. */
async function player() {
  const ws = new WebSocket(`ws://localhost:${relay.port}`);
  clients.push(ws);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    const i = waiters.findIndex((w) => w.t === msg.t);
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  await new Promise((r) => ws.once('open', r));
  return {
    send: (msg) => ws.send(JSON.stringify(msg)),
    next: (t) => {
      const i = inbox.findIndex((m) => m.t === t);
      if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
      return new Promise((resolve) => waiters.push({ t, resolve }));
    },
    close: () => ws.close(),
  };
}

const seat = (name, model, power = null) => ({ name, loadout: { model, power } });

describe('room codes', () => {
  it('starts a match when a friend joins with the code', async () => {
    const a = await player();
    const b = await player();
    a.send({ t: 'create', room: 'private', ...seat('Ravi', 'retro51', 'hanuman') });
    const { code } = await a.next('created');
    b.send({ t: 'join', code: code.toLowerCase(), room: 'private', ...seat('Sita', 'reynolds') });
    const players = [seat('Ravi', 'retro51', 'hanuman'), seat('Sita', 'reynolds')];
    expect(await a.next('start')).toEqual({ t: 'start', you: 0, room: 'private', players });
    expect(await b.next('start')).toEqual({ t: 'start', you: 1, room: 'private', players });

    a.send({ t: 'shot', flick: { along: 0, ix: 1, iy: 2 } });
    expect((await b.next('shot')).flick).toEqual({ along: 0, ix: 1, iy: 2 });
    b.send({ t: 'prize', kind: 'break' });
    expect(await a.next('prize')).toEqual({ t: 'prize', kind: 'break' });
  });

  it('explains an unknown code', async () => {
    const b = await player();
    b.send({ t: 'join', code: 'ZZZZ', room: 'public', ...seat('B', 'cello') });
    expect((await b.next('error')).message).toMatch(/No room called ZZZZ/);
  });

  it('turns away a player who picked a different bet', async () => {
    const a = await player();
    const b = await player();
    a.send({ t: 'create', room: 'cbse', ...seat('A', 'cello') });
    const { code } = await a.next('created');
    b.send({ t: 'join', code, room: 'public', ...seat('B', 'cello') });
    expect((await b.next('error')).message).toMatch(/₹75/);
  });

  it('cleans up unknown pens and powers', async () => {
    const a = await player();
    const b = await player();
    a.send({ t: 'create', room: 'public', name: 'A', loadout: { model: 'laser', power: 'godmode' } });
    const { code } = await a.next('created');
    b.send({ t: 'join', code, room: 'public', ...seat('B', 'cello') });
    expect((await a.next('start')).players[0].loadout).toEqual({ model: 'ballpoint', power: null });
  });
});

describe('quick match', () => {
  it('pairs the next two players looking in the same room', async () => {
    const a = await player();
    const b = await player();
    const c = await player();
    a.send({ t: 'quick', room: 'public', ...seat('A', 'addgel') });
    await a.next('queued');
    c.send({ t: 'quick', room: 'international', ...seat('C', 'titan') });
    await c.next('queued');
    b.send({ t: 'quick', room: 'public', ...seat('B', 'cello') });
    expect((await a.next('start')).players.map((p) => p.name)).toEqual(['A', 'B']);
    expect((await b.next('start')).you).toBe(1);

    b.send({ t: 'next' });
    expect(await a.next('next')).toEqual({ t: 'next' });
  });

  it('skips a player who stopped looking', async () => {
    const a = await player();
    const b = await player();
    const c = await player();
    a.send({ t: 'quick', room: 'public', ...seat('A', 'cello') });
    await a.next('queued');
    a.send({ t: 'cancel' });
    b.send({ t: 'quick', room: 'public', ...seat('B', 'cello') });
    await b.next('queued');
    c.send({ t: 'quick', room: 'public', ...seat('C', 'reynolds') });
    expect((await c.next('start')).you).toBe(1);
    expect((await b.next('start')).you).toBe(0);
  });

  it('skips a player who left', async () => {
    const a = await player();
    a.send({ t: 'quick', room: 'public', ...seat('A', 'cello') });
    await a.next('queued');
    a.close();
    await new Promise((r) => setTimeout(r, 50));
    const b = await player();
    b.send({ t: 'quick', room: 'public', ...seat('B', 'cello') });
    expect(await b.next('queued')).toEqual({ t: 'queued' });
  });
});
