/** Room codes: four letters, no I or O (see server/relay.js). */
const CODE = /^[A-HJ-NP-Z]{4}$/;

export const isRoomCode = (s: string) => CODE.test(s);

/** A link that opens the game straight into `code`'s room. */
export function inviteLink(code: string, base: string = location.origin + location.pathname): string {
  const url = new URL(base);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.toString();
}

/**
 * The room code from an invite link this page was opened with, if any.
 * Removes it from the address bar so a reload doesn't join again.
 */
export function takeInviteCode(): string | null {
  const url = new URL(location.href);
  const code = url.searchParams.get('room')?.trim().toUpperCase() ?? '';
  if (!url.searchParams.has('room')) return null;
  url.searchParams.delete('room');
  history.replaceState(history.state, '', url.toString());
  return isRoomCode(code) ? code : null;
}
