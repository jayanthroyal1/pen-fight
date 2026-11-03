import { currentPenId } from '../game/pens';
import { isPowerId } from '../game/powers';
import { isRoomId, room as roomById, type RoomId } from '../game/rooms';
import type { PlayerId } from '../game/types';
import type { GameLink, Listener } from './link';
import type { ClientMsg, Seat, ServerMsg } from './protocol';

/**
 * Online rooms over a realtime service's channels, with no server of our own:
 * presence says who is in a room, broadcast carries the moves. The service is
 * reached through `Realtime` (Supabase in the game, a fake in tests).
 */

/** What each player announces about themselves in a channel. */
export interface Member {
  seat: Seat;
  room: RoomId;
  role: 'host' | 'guest';
  /** When they arrived, to decide who plays first in a quick match. */
  at: number;
}

export interface PresenceChannel {
  onSync(cb: () => void): void;
  onLeave(cb: (key: string) => void): void;
  onMessage(cb: (payload: unknown) => void): void;
  /** Resolves once the channel is joined. */
  subscribe(): Promise<void>;
  track(member: Member): Promise<void>;
  /** Everyone in the channel, by their presence key. */
  members(): Record<string, Member>;
  send(payload: unknown): Promise<void>;
  leave(): Promise<void>;
}

export interface Realtime {
  /** Opens a channel where this player is known by `key`. */
  channel(name: string, key: string): PresenceChannel;
}

// No I or O, so codes are easy to read aloud (same as the relay's).
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const RELAYED = new Set(['shot', 'aim', 'defend', 'sync', 'next', 'prize']);
/** How long to wait for a channel to say who's already there. */
const SETTLE_MS = 1200;

/** A seat from the other player, with anything unknown replaced by safe defaults. */
function cleanSeat(seat: Partial<Seat> | undefined): Seat {
  const loadout = seat?.loadout;
  return {
    name: String(seat?.name ?? 'Player').slice(0, 20) || 'Player',
    loadout: {
      model: currentPenId(String(loadout?.model ?? '')),
      power: isPowerId(loadout?.power) ? loadout.power : null,
    },
  };
}

export class RealtimeLink implements GameLink {
  private listeners = new Set<Listener>();
  private match: PresenceChannel | null = null;
  private lobby: PresenceChannel | null = null;
  private started = false;
  private pairing = false;
  private rt: Promise<Realtime>;

  constructor(
    realtime: Realtime | Promise<Realtime>,
    private id: string = randomId(),
    private rng: () => number = Math.random,
  ) {
    this.rt = Promise.resolve(realtime);
  }

  async send(msg: ClientMsg): Promise<void> {
    switch (msg.t) {
      case 'create':
        return this.create(msg.room, { name: msg.name, loadout: msg.loadout });
      case 'join':
        return this.join(msg.code.toUpperCase(), msg.room, { name: msg.name, loadout: msg.loadout });
      case 'quick':
        return this.quick(msg.room, { name: msg.name, loadout: msg.loadout });
      case 'cancel':
        return this.reset();
      default:
        await this.match?.send(msg);
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.listeners.clear();
    void this.reset();
  }

  private emit(msg: ServerMsg): void {
    for (const l of this.listeners) l(msg);
  }

  /** Opens a room channel and wires up start, moves and departures. */
  private async openRoom(name: string): Promise<PresenceChannel> {
    const ch = (await this.rt).channel(name, this.id);
    ch.onMessage((payload) => {
      const msg = payload as ServerMsg;
      if (msg && RELAYED.has(msg.t)) this.emit(msg);
    });
    ch.onSync(() => this.maybeStart(ch));
    ch.onLeave((key) => {
      if (this.started && ch === this.match && key !== this.id) this.emit({ t: 'peer-left' });
    });
    await ch.subscribe();
    return ch;
  }

  /** Waits for the first word on who's already in a channel (or a short timeout). */
  private settle(ch: PresenceChannel): Promise<void> {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      ch.onSync(finish);
      globalThis.setTimeout(finish, SETTLE_MS);
    });
  }

  private async create(room: RoomId, seat: Seat): Promise<void> {
    await this.reset();
    for (let attempt = 0; attempt < 6; attempt++) {
      const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(this.rng() * LETTERS.length)]).join('');
      const ch = await this.openRoom(`pf-room-${code}`);
      await this.settle(ch);
      // Someone already has this code: try another.
      if (Object.keys(ch.members()).length > 0) {
        await ch.leave();
        continue;
      }
      this.match = ch;
      await ch.track({ seat, room, role: 'host', at: Date.now() });
      this.emit({ t: 'created', code });
      return;
    }
    this.emit({ t: 'error', message: 'Couldn’t make a room just now. Try again.' });
  }

  private async join(code: string, room: RoomId, seat: Seat): Promise<void> {
    await this.reset();
    const ch = await this.openRoom(`pf-room-${code}`);
    await this.settle(ch);
    const members = Object.values(ch.members());
    const host = members.find((m) => m.role === 'host');
    const problem = !host
      ? `No room called ${code}. Check the code with your friend.`
      : members.length >= 2
        ? `Room ${code} already has two players.`
        : isRoomId(host.room) && host.room !== room
          ? `Room ${code} is a ₹${roomById(host.room).bet} match. Pick that bet to join.`
          : null;
    if (problem) {
      await ch.leave();
      this.emit({ t: 'error', message: problem });
      return;
    }
    this.match = ch;
    await ch.track({ seat, room, role: 'guest', at: Date.now() });
  }

  /** Quick match: wait in the bet room's lobby; the two who arrived first are paired. */
  private async quick(room: RoomId, seat: Seat): Promise<void> {
    await this.reset();
    const lobby = (await this.rt).channel(`pf-lobby-${room}`, this.id);
    this.lobby = lobby;
    lobby.onSync(() => void this.pair(lobby, room, seat));
    await lobby.subscribe();
    await lobby.track({ seat, room, role: 'guest', at: Date.now() });
    this.emit({ t: 'queued' });
  }

  private async pair(lobby: PresenceChannel, room: RoomId, seat: Seat): Promise<void> {
    if (this.pairing || this.started || lobby !== this.lobby) return;
    const waiting = Object.entries(lobby.members()).sort(([ka, a], [kb, b]) => a.at - b.at || ka.localeCompare(kb));
    if (waiting.length < 2) return;
    const [first, second] = waiting;
    if (first[0] !== this.id && second[0] !== this.id) return;
    this.pairing = true;
    // Stay in the lobby until the match starts: leaving now could hide this
    // player from the other one, who may not have looked at the lobby yet.
    // Both players work out the same private room from their two ids.
    const ch = await this.openRoom(`pf-match-${first[0]}-${second[0]}`);
    this.match = ch;
    await ch.track({ seat, room, role: first[0] === this.id ? 'host' : 'guest', at: Date.now() });
  }

  /** Once both players are in the room, the match starts: the host is player 1. */
  private maybeStart(ch: PresenceChannel): void {
    if (this.started || ch !== this.match) return;
    const entries = Object.entries(ch.members());
    if (entries.length < 2) return;
    const host = entries.find(([, m]) => m.role === 'host') ?? entries.sort(([, a], [, b]) => a.at - b.at)[0];
    const guest = entries.find(([k]) => k !== host[0]);
    if (!guest) return;
    this.started = true;
    // Matched: out of the quick-match lobby, so nobody else pairs with us.
    const lobby = this.lobby;
    this.lobby = null;
    void lobby?.leave().catch(() => undefined);
    const you: PlayerId = host[0] === this.id ? 0 : 1;
    this.emit({
      t: 'start',
      you,
      room: isRoomId(host[1].room) ? host[1].room : 'public',
      players: [cleanSeat(host[1].seat), cleanSeat(guest[1].seat)],
    });
  }

  private async reset(): Promise<void> {
    const channels = [this.match, this.lobby].filter((c): c is PresenceChannel => c !== null);
    this.match = null;
    this.lobby = null;
    this.started = false;
    this.pairing = false;
    await Promise.all(channels.map((c) => c.leave().catch(() => undefined)));
  }
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.().slice(0, 12) ?? Math.random().toString(36).slice(2, 14);
}
