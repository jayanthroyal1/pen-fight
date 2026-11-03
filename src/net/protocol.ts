import type { BoostId } from '../game/boosts';
import type { RoomId } from '../game/rooms';
import type { Flick, GameState, Loadout, PlayerId } from '../game/types';

/** Who is playing: shown to the opponent, and their pen. */
export interface Seat {
  name: string;
  loadout: Loadout;
}

/** What the winner did with the loser's pen. */
export type PrizeKind = 'take' | 'swap' | 'break' | 'return';

/**
 * Messages between a browser and the relay server (`server/relay.js`).
 * The server only pairs players in a bet room and forwards `shot`, `sync`,
 * `next` and `prize`. The shooter's browser is the authority for how its shot
 * ended: it sends `sync` with the settled, resolved state and the other side
 * adopts it. Each browser settles its own player's wallet at the end.
 */
export type ClientMsg =
  | ({ t: 'create'; room: RoomId } & Seat)
  | ({ t: 'join'; code: string; room: RoomId } & Seat)
  /** Quick match: pair me with the next player looking in the same room. */
  | ({ t: 'quick'; room: RoomId } & Seat)
  /** Stop looking for a quick match, or give up a room nobody has joined. */
  | { t: 'cancel' }
  /** A flick, with the super power the shooter armed for it, if any. */
  | { t: 'shot'; flick: Flick; boost?: BoostId | null }
  | { t: 'sync'; state: GameState }
  | { t: 'next' }
  /** The match winner's decision about the loser's pen. */
  | { t: 'prize'; kind: PrizeKind };

export type ServerMsg =
  | { t: 'created'; code: string }
  /** In the quick-match queue; `start` follows when someone else looks. */
  | { t: 'queued' }
  /** `players` holds both seats, by player number. */
  | { t: 'start'; you: PlayerId; room: RoomId; players: [Seat, Seat] }
  | { t: 'error'; message: string }
  | { t: 'shot'; flick: Flick; boost?: BoostId | null }
  | { t: 'sync'; state: GameState }
  | { t: 'next' }
  | { t: 'prize'; kind: PrizeKind }
  | { t: 'peer-left' };
