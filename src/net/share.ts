import { isRoomId, type RoomId } from '../game/rooms';
import { isRoomCode } from './invite';

/** An app the invite can be sent through, as a link that opens it ready to send. */
export interface ShareTarget {
  id: 'whatsapp' | 'telegram' | 'sms' | 'email' | 'facebook';
  label: string;
  href: string;
}

/**
 * Links that open each app with the invite already written. They work on
 * phones and computers; the phone's own share sheet (`navigator.share`) adds
 * every other app installed.
 */
export function shareTargets(message: string, link: string): ShareTarget[] {
  const text = `${message} ${link}`;
  const enc = encodeURIComponent;
  return [
    { id: 'whatsapp', label: 'WhatsApp', href: `https://wa.me/?text=${enc(text)}` },
    { id: 'telegram', label: 'Telegram', href: `https://t.me/share/url?url=${enc(link)}&text=${enc(message)}` },
    // `sms:?&body=` is understood by both Android and iPhone.
    { id: 'sms', label: 'SMS', href: `sms:?&body=${enc(text)}` },
    { id: 'email', label: 'Email', href: `mailto:?subject=${enc('Pen fight?')}&body=${enc(text)}` },
    { id: 'facebook', label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${enc(link)}` },
  ];
}

/**
 * The room code in what someone typed or pasted: a bare code ("srtf"), an
 * invite link (which also says which bet room it's for), or a whole shared
 * message with the link in it.
 */
export function readInvite(input: string): { code: string; room: RoomId | null } | null {
  const text = input.trim();
  // A whole pasted message works too: find the link in it.
  const linkText = text.split(/\s+/).find((word) => /room=/i.test(word));
  if (linkText) {
    try {
      const query = linkText.slice(linkText.indexOf('?'));
      const url = new URL(`https://invite.local/${query}`);
      const code = url.searchParams.get('room')?.toUpperCase() ?? '';
      const bet = url.searchParams.get('bet');
      return isRoomCode(code) ? { code, room: isRoomId(bet) ? bet : null } : null;
    } catch {
      return null;
    }
  }
  const code = text.replace(/[^a-z]/gi, '').toUpperCase();
  return isRoomCode(code) ? { code, room: null } : null;
}
