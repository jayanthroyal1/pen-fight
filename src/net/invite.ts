import { isRoomId, type RoomId } from '../game/rooms';

/** Room codes: four letters, no I or O (see server/relay.js). */
const CODE = /^[A-HJ-NP-Z]{4}$/;

export const isRoomCode = (s: string) => CODE.test(s);

export interface Invite {
  code: string;
  /** The bet room the friend is playing in. */
  room: RoomId;
}

/** A link that opens the game straight into `code`'s room, in its bet room. */
export function inviteLink(invite: Invite, base: string = location.origin + location.pathname): string {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', invite.code);
  url.searchParams.set('bet', invite.room);
  return url.toString();
}

/**
 * The invite this page was opened with, if any. Removes it from the address
 * bar so a reload doesn't join again.
 */
export function takeInvite(): Invite | null {
  const url = new URL(location.href);
  if (!url.searchParams.has('room')) return null;
  const code = url.searchParams.get('room')?.trim().toUpperCase() ?? '';
  const room = url.searchParams.get('bet') ?? 'public';
  url.searchParams.delete('room');
  url.searchParams.delete('bet');
  history.replaceState(history.state, '', url.toString());
  return isRoomCode(code) ? { code, room: isRoomId(room) ? room : 'public' } : null;
}
