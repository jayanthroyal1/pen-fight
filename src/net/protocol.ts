import type { PenModelId } from '../game/pens';
import type { Flick, GameState, PlayerId } from '../game/types';

/**
 * Messages between a browser and the relay server (`server/index.js`).
 * The server only pairs players and forwards `shot`, `sync` and `next`.
 * The shooter's browser is the authority for how its shot ended: it sends
 * `sync` with the settled, resolved state and the other side adopts it.
 */
export type ClientMsg =
  | { t: 'create'; model: PenModelId }
  | { t: 'join'; code: string; model: PenModelId }
  | { t: 'shot'; flick: Flick }
  | { t: 'sync'; state: GameState }
  | { t: 'next' };

export type ServerMsg =
  | { t: 'created'; code: string }
  /** `models` holds each player's chosen pen, by player number. */
  | { t: 'start'; you: PlayerId; models: [PenModelId, PenModelId] }
  | { t: 'error'; message: string }
  | { t: 'shot'; flick: Flick }
  | { t: 'sync'; state: GameState }
  | { t: 'next' }
  | { t: 'peer-left' };
