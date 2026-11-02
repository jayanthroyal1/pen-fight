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

describe('room codes', () => {
  it('starts a match when a friend joins with the code', async () => {
    const a = await player();
    const b = await player();
    a.send({ t: 'create', model: 'retro51' });
    const { code } = await a.next('created');
    b.send({ t: 'join', code: code.toLowerCase(), model: 'ballpoint' });
    expect(await a.next('start')).toEqual({ t: 'start', you: 0, models: ['retro51', 'ballpoint'] });
    expect(await b.next('start')).toEqual({ t: 'start', you: 1, models: ['retro51', 'ballpoint'] });

    a.send({ t: 'shot', flick: { along: 0, ix: 1, iy: 2 } });
    expect((await b.next('shot')).flick).toEqual({ along: 0, ix: 1, iy: 2 });
  });

  it('explains an unknown code', async () => {
    const b = await player();
    b.send({ t: 'join', code: 'ZZZZ', model: 'cello' });
    expect((await b.next('error')).message).toMatch(/No room called ZZZZ/);
  });
});

describe('quick match', () => {
  it('pairs the next two players looking', async () => {
    const a = await player();
    const b = await player();
    a.send({ t: 'quick', model: 'addgel' });
    await a.next('queued');
    b.send({ t: 'quick', model: 'cello' });
    expect(await a.next('start')).toEqual({ t: 'start', you: 0, models: ['addgel', 'cello'] });
    expect(await b.next('start')).toEqual({ t: 'start', you: 1, models: ['addgel', 'cello'] });

    b.send({ t: 'next' });
    expect(await a.next('next')).toEqual({ t: 'next' });
  });

  it('skips a player who stopped looking', async () => {
    const a = await player();
    const b = await player();
    const c = await player();
    a.send({ t: 'quick', model: 'cello' });
    await a.next('queued');
    a.send({ t: 'cancel' });
    b.send({ t: 'quick', model: 'cello' });
    await b.next('queued');
    c.send({ t: 'quick', model: 'reynolds' });
    expect((await c.next('start')).you).toBe(1);
    expect((await b.next('start')).you).toBe(0);
  });

  it('skips a player who left', async () => {
    const a = await player();
    a.send({ t: 'quick', model: 'cello' });
    await a.next('queued');
    a.close();
    await new Promise((r) => setTimeout(r, 50));
    const b = await player();
    b.send({ t: 'quick', model: 'cello' });
    expect(await b.next('queued')).toEqual({ t: 'queued' });
  });
});
