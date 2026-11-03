import { describe, expect, it } from 'vitest';
import type { Seat, ServerMsg } from './protocol';
import { RealtimeLink, type Member, type PresenceChannel, type Realtime } from './realtimeLink';

/** An in-memory stand-in for Supabase Realtime: presence per channel, and broadcast to the others. */
class Hub implements Realtime {
  rooms = new Map<string, Set<FakeChannel>>();
  channel(name: string, key: string): PresenceChannel {
    return new FakeChannel(this, name, key);
  }
  peers(name: string): FakeChannel[] {
    return [...(this.rooms.get(name) ?? [])];
  }
  syncAll(name: string): void {
    for (const c of this.peers(name)) c.fire();
  }
}

class FakeChannel implements PresenceChannel {
  private syncs: (() => void)[] = [];
  private leaves: ((key: string) => void)[] = [];
  private messages: ((payload: unknown) => void)[] = [];
  member: Member | null = null;

  constructor(
    private hub: Hub,
    private name: string,
    readonly key: string,
  ) {}

  onSync(cb: () => void) {
    this.syncs.push(cb);
  }
  onLeave(cb: (key: string) => void) {
    this.leaves.push(cb);
  }
  onMessage(cb: (payload: unknown) => void) {
    this.messages.push(cb);
  }
  fire() {
    // Like the real service, presence news arrives a moment later.
    setTimeout(() => this.syncs.forEach((f) => f()), 5);
  }
  async subscribe() {
    if (!this.hub.rooms.has(this.name)) this.hub.rooms.set(this.name, new Set());
    this.hub.rooms.get(this.name)!.add(this);
    this.fire();
  }
  async track(member: Member) {
    this.member = member;
    this.hub.syncAll(this.name);
  }
  members() {
    const out: Record<string, Member> = {};
    for (const c of this.hub.peers(this.name)) if (c.member) out[c.key] = c.member;
    return out;
  }
  async send(payload: unknown) {
    for (const c of this.hub.peers(this.name)) if (c !== this) c.messages.forEach((f) => f(structuredClone(payload)));
  }
  async leave() {
    this.hub.rooms.get(this.name)?.delete(this);
    if (this.member) for (const c of this.hub.peers(this.name)) c.leaves.forEach((f) => f(this.key));
    this.hub.syncAll(this.name);
  }
}

/** A test player: a link plus an inbox to wait on. */
function player(hub: Hub, id: string, seed: number) {
  let s = seed;
  const link = new RealtimeLink(hub, id, () => (s = (s * 16807) % 2147483647) / 2147483647);
  const inbox: ServerMsg[] = [];
  link.subscribe((m) => inbox.push(m));
  const next = async <T extends ServerMsg['t']>(t: T): Promise<Extract<ServerMsg, { t: T }>> => {
    for (let i = 0; i < 400; i++) {
      const at = inbox.findIndex((m) => m.t === t);
      if (at >= 0) return inbox.splice(at, 1)[0] as Extract<ServerMsg, { t: T }>;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`no ${t} for ${id}`);
  };
  return { link, next, inbox };
}

/** A player's seat; pen and power are plain strings so tests can send bad ones too. */
const seat = (name: string, model = 'click-red', power: string | null = null): Seat =>
  ({ name, loadout: { model, power } }) as Seat;

describe('rooms over realtime channels', () => {
  it('starts a match when a friend joins with the code, then relays moves', async () => {
    const hub = new Hub();
    const a = player(hub, 'aaa', 3);
    const b = player(hub, 'bbb', 7);
    await a.link.send({ t: 'create', room: 'private', ...seat('Ravi', 'gold-dot', 'hanuman') });
    const { code } = await a.next('created');
    expect(code).toMatch(/^[A-HJ-NP-Z]{4}$/);

    await b.link.send({ t: 'join', code: code.toLowerCase(), room: 'private', ...seat('Sita', 'gripper') });
    const startA = await a.next('start');
    const startB = await b.next('start');
    expect(startA.you).toBe(0);
    expect(startB.you).toBe(1);
    expect(startA.room).toBe('private');
    expect(startB.players.map((p) => p.name)).toEqual(['Ravi', 'Sita']);
    expect(startB.players[0].loadout).toEqual({ model: 'gold-dot', power: 'hanuman' });

    await a.link.send({ t: 'shot', flick: { along: 0, ix: 1, iy: 2 }, boost: 'ice' });
    const shot = await b.next('shot');
    expect(shot.flick).toEqual({ along: 0, ix: 1, iy: 2 });
    expect(shot.boost).toBe('ice');
    await a.link.send({ t: 'aim', flick: { along: 5, ix: -300, iy: 20 } });
    expect((await b.next('aim')).flick).toEqual({ along: 5, ix: -300, iy: 20 });
    await b.link.send({ t: 'defend', id: 'wall' });
    expect(await a.next('defend')).toEqual({ t: 'defend', id: 'wall' });
    await b.link.send({ t: 'prize', kind: 'break' });
    expect(await a.next('prize')).toEqual({ t: 'prize', kind: 'break' });

    b.link.close();
    expect(await a.next('peer-left')).toEqual({ t: 'peer-left' });
  });

  it('explains an unknown code, a different bet, and a full room', async () => {
    const hub = new Hub();
    const a = player(hub, 'aaa', 3);
    const b = player(hub, 'bbb', 7);
    const c = player(hub, 'ccc', 11);

    await c.link.send({ t: 'join', code: 'ZZZZ', room: 'public', ...seat('C') });
    expect((await c.next('error')).message).toMatch(/No room called ZZZZ/);

    await a.link.send({ t: 'create', room: 'cbse', ...seat('A', 'click-sky') });
    const { code } = await a.next('created');
    await c.link.send({ t: 'join', code, room: 'public', ...seat('C') });
    expect((await c.next('error')).message).toMatch(/₹75/);

    await b.link.send({ t: 'join', code, room: 'cbse', ...seat('B', 'click-sky') });
    await b.next('start');
    await c.link.send({ t: 'join', code, room: 'cbse', ...seat('C') });
    expect((await c.next('error')).message).toMatch(/already has two players/);
  });

  it('cleans up an opponent’s unknown pens and powers', async () => {
    const hub = new Hub();
    const a = player(hub, 'aaa', 3);
    const b = player(hub, 'bbb', 7);
    await a.link.send({ t: 'create', room: 'public', name: 'A', loadout: { model: 'laser' as never, power: 'godmode' as never } });
    const { code } = await a.next('created');
    await b.link.send({ t: 'join', code, room: 'public', ...seat('B') });
    expect((await b.next('start')).players[0].loadout).toEqual({ model: 'inkmax-aqua', power: null });
  });
});

describe('quick match over realtime channels', () => {
  it('pairs the first two players looking in the same bet room', async () => {
    const hub = new Hub();
    const a = player(hub, 'aaa', 3);
    const b = player(hub, 'bbb', 7);
    const c = player(hub, 'ccc', 11);
    await a.link.send({ t: 'quick', room: 'public', ...seat('A') });
    await a.next('queued');
    await c.link.send({ t: 'quick', room: 'international', ...seat('C', 'gold-dot') });
    await c.next('queued');
    await b.link.send({ t: 'quick', room: 'public', ...seat('B') });

    const sa = await a.next('start');
    const sb = await b.next('start');
    expect(sa.you).toBe(0);
    expect(sb.you).toBe(1);
    expect(sb.players.map((p) => p.name)).toEqual(['A', 'B']);
    await new Promise((r) => setTimeout(r, 50));
    expect(c.inbox.some((m) => m.t === 'start')).toBe(false);

    await b.link.send({ t: 'next' });
    expect(await a.next('next')).toEqual({ t: 'next' });
  });

  it('skips a player who stopped looking', async () => {
    const hub = new Hub();
    const a = player(hub, 'aaa', 3);
    const b = player(hub, 'bbb', 7);
    const c = player(hub, 'ccc', 11);
    await a.link.send({ t: 'quick', room: 'public', ...seat('A') });
    await a.next('queued');
    await a.link.send({ t: 'cancel' });
    await b.link.send({ t: 'quick', room: 'public', ...seat('B') });
    await b.next('queued');
    await c.link.send({ t: 'quick', room: 'public', ...seat('C') });
    expect((await c.next('start')).players.map((p) => p.name)).toEqual(['B', 'C']);
  });
});
