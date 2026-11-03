import { useEffect, useRef, useState } from 'react';
import { penModel } from '../game/pens';
import { power as powerOf } from '../game/powers';
import { room as roomById, type Room } from '../game/rooms';
import type { PlayerId } from '../game/types';
import { OnlineClient } from '../net/client';
import { inviteLink } from '../net/invite';
import { readInvite, shareTargets } from '../net/share';
import type { ClientMsg, Seat } from '../net/protocol';
import { Rupees } from './PenBox';

interface Props {
  /** The bet room you're playing in. */
  room: Room;
  /** Your name and the pen you bring. */
  seat: Seat;
  /** Room code to join straight away, from an invite link. */
  joinCode?: string;
  onStart: (client: OnlineClient, me: PlayerId, players: [Seat, Seat]) => void;
  onBack: () => void;
}

type LobbyState =
  | { kind: 'idle' }
  | { kind: 'connecting'; doing: 'create' | 'join' | 'quick' }
  | { kind: 'waiting'; code: string }
  | { kind: 'searching' };

const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

export function OnlineLobby({ room, seat, joinCode, onStart, onBack }: Props) {
  const [lobby, setLobby] = useState<LobbyState>(joinCode ? { kind: 'connecting', doing: 'join' } : { kind: 'idle' });
  const [code, setCode] = useState(joinCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'link' | 'code' | null>(null);
  const clientRef = useRef<OnlineClient | null>(null);
  const startedRef = useRef(false);

  const connect = (): OnlineClient => {
    clientRef.current?.close();
    const client = new OnlineClient();
    clientRef.current = client;
    client.subscribe((msg) => {
      if (msg.t === 'created') setLobby({ kind: 'waiting', code: msg.code });
      else if (msg.t === 'queued') setLobby({ kind: 'searching' });
      else if (msg.t === 'error') {
        setError(msg.message);
        setLobby({ kind: 'idle' });
      } else if (msg.t === 'peer-left' && !startedRef.current && clientRef.current === client) {
        setError('Lost the connection to the game server. Try again.');
        setLobby({ kind: 'idle' });
      } else if (msg.t === 'start') {
        startedRef.current = true;
        onStart(client, msg.you, msg.players);
      }
    });
    return client;
  };

  type Ask = { t: 'create' } | { t: 'quick' } | { t: 'join'; code: string };
  const run = async (ask: Ask) => {
    const msg = { ...ask, room: room.id, ...seat } as ClientMsg & { t: Ask['t'] };
    setError(null);
    setCopied(null);
    setLobby({ kind: 'connecting', doing: msg.t });
    try {
      await connect().send(msg);
    } catch {
      setError("Couldn't reach the game server. Check your connection and try again.");
      setLobby({ kind: 'idle' });
    }
  };

  /** Stops looking or gives up the room, back to the choices. */
  const cancel = () => {
    const client = clientRef.current;
    clientRef.current = null;
    if (client) void client.send({ t: 'cancel' }).finally(() => client.close());
    setLobby({ kind: 'idle' });
  };

  // An invite link joins its room as soon as the pen is chosen. The short delay lets
  // React's development double-mount settle before connecting.
  useEffect(() => {
    if (!joinCode) return;
    const id = window.setTimeout(() => void run({ t: 'join', code: joinCode }), 0);
    return () => window.clearTimeout(id);
    // Runs once, on arrival from an invite link.
  }, []);

  useEffect(
    () => () => {
      if (!startedRef.current) clientRef.current?.close();
    },
    [],
  );

  /** Joins the room in what was typed or pasted; says what's wrong if it can't. */
  const join = (text: string) => {
    const invite = readInvite(text);
    if (!invite) {
      setError('Room codes are 4 letters, like QWER. Type the code or paste the invite your friend sent.');
      return;
    }
    if (invite.room && invite.room !== room.id) {
      const other = roomById(invite.room);
      setError(`That invite is for the ₹${other.bet} ${other.name} room. Go back, pick that bet, then join.`);
      return;
    }
    setCode(invite.code);
    void run({ t: 'join', code: invite.code });
  };

  const onJoin = (e: React.FormEvent) => {
    e.preventDefault();
    join(code);
  };

  const link = lobby.kind === 'waiting' ? inviteLink({ code: lobby.code, room: room.id }) : '';

  const message = `Pen fight me for ₹${room.bet}! Tap to join my room ${lobby.kind === 'waiting' ? lobby.code : ''}:`;

  /** The phone's own share sheet: every messaging app installed. */
  const share = async () => {
    try {
      await navigator.share({ title: 'Pen Fight', text: message, url: link });
    } catch {
      // Closing the share sheet is not an error worth showing.
    }
  };

  const copy = async (what: 'link' | 'code', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setError(`Couldn’t copy the ${what}. Select it and copy it yourself.`);
    }
  };

  const busy = lobby.kind === 'connecting';

  return (
    <main className="cover">
      <header className="name-label">
        <h1 className="label-title">{room.name}</h1>
        <p className="label-note">
          Bet <Rupees amount={room.bet} /> · your pen: {penModel(seat.loadout.model).name}
          {seat.loadout.power && ` (${powerOf(seat.loadout.power).name})`}
        </p>
      </header>

      {lobby.kind === 'waiting' && (
        <section className="lobby-wait">
          <h2>Invite your friend</h2>
          <div className="code-card">
            <span className="code-label">Room code</span>
            <span className="room-code" aria-label={`Room code ${lobby.code.split('').join(' ')}`}>
              {lobby.code}
            </span>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => void copy('code', lobby.code)}>
              {copied === 'code' ? 'Code copied' : 'Copy code'}
            </button>
          </div>
          <p className="muted">Your friend types this code under “Got a code?”, or taps the link you send.</p>

          <h3 className="share-title">Send the link</h3>
          <ul className="share-grid">
            {shareTargets(message, link).map((t) => (
              <li key={t.id}>
                <a className={`share-btn share-${t.id}`} href={t.href} target="_blank" rel="noopener noreferrer">
                  Send on {t.label}
                </a>
              </li>
            ))}
            {canShare && (
              <li>
                <button type="button" className="share-btn share-more" onClick={() => void share()}>
                  More apps…
                </button>
              </li>
            )}
          </ul>
          <label className="field">
            <span>Invite link</span>
            <input className="invite-link" value={link} readOnly onFocus={(e) => e.currentTarget.select()} />
          </label>
          <button type="button" className="btn btn-secondary" onClick={() => void copy('link', link)}>
            {copied === 'link' ? 'Link copied' : 'Copy link'}
          </button>
          <p className="waiting" aria-live="polite">
            Waiting for your friend to join…
          </p>
          <button type="button" className="btn btn-secondary" onClick={cancel}>
            Cancel
          </button>
        </section>
      )}

      {lobby.kind === 'searching' && (
        <section className="lobby-wait" aria-live="polite">
          <h2>Finding an opponent</h2>
          <p className="waiting">Looking for someone else who wants a pen fight…</p>
          <p className="muted">The match starts as soon as another player looks too.</p>
          <button type="button" className="btn btn-secondary" onClick={cancel}>
            Stop looking
          </button>
        </section>
      )}

      {lobby.kind === 'connecting' && lobby.doing === 'join' && joinCode && (
        <p className="waiting" aria-live="polite">
          Joining room {joinCode}…
        </p>
      )}

      {(lobby.kind === 'idle' || (lobby.kind === 'connecting' && !joinCode)) && (
        <>
          <section className="lobby-panel">
            <h2>Play anyone</h2>
            <p className="muted">We pair you with the next player looking in this ₹{room.bet} room.</p>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run({ t: 'quick' })}>
              Find an opponent
            </button>
          </section>

          <div className="lobby">
            <section className="lobby-panel">
              <h2>Invite a friend</h2>
              <p className="muted">Get a link to send them.</p>
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void run({ t: 'create' })}>
                Create room
              </button>
            </section>

            <form className="lobby-panel" onSubmit={onJoin}>
              <h2>Got a code?</h2>
              <label className="field">
                <span>Room code or invite link</span>
                <input
                  value={code}
                  onChange={(e) => {
                    const value = e.target.value;
                    setCode(value.includes('room=') ? value : value.toUpperCase());
                    setError(null);
                    // A complete code or a pasted invite joins straight away.
                    if (!busy && readInvite(value)) join(value);
                  }}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="e.g. QWER"
                />
              </label>
              <button type="submit" className="btn btn-secondary" disabled={busy}>
                Join room
              </button>
            </form>
          </div>
        </>
      )}

      {lobby.kind === 'connecting' && !joinCode && (
        <p className="waiting" aria-live="polite">
          Connecting to the game server…
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="btn btn-secondary" onClick={onBack}>
        Go to menu
      </button>
    </main>
  );
}
