import { useEffect, useRef, useState } from 'react';
import { penModel } from '../game/pens';
import { power as powerOf } from '../game/powers';
import type { Room } from '../game/rooms';
import type { PlayerId } from '../game/types';
import { OnlineClient } from '../net/client';
import { inviteLink, isRoomCode } from '../net/invite';
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
  const [copied, setCopied] = useState(false);
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
    setCopied(false);
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

  const onJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!isRoomCode(trimmed)) {
      setError('Room codes are 4 letters, like QWER. Check the code with your friend.');
      return;
    }
    void run({ t: 'join', code: trimmed });
  };

  const link = lobby.kind === 'waiting' ? inviteLink({ code: lobby.code, room: room.id }) : '';

  const share = async () => {
    try {
      await navigator.share({
        title: 'Pen Fight',
        text: `Pen fight me for ₹${room.bet}! Room ${lobby.kind === 'waiting' ? lobby.code : ''}`,
        url: link,
      });
    } catch {
      // Closing the share sheet is not an error worth showing.
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError('Couldn’t copy the link. Select it and copy it yourself.');
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
        <section className="lobby-wait" aria-live="polite">
          <h2>Invite your friend</h2>
          <p className="muted">Send them this link. It opens the game and puts them in your room.</p>
          <label className="field">
            <span>Invite link</span>
            <input className="invite-link" value={link} readOnly onFocus={(e) => e.currentTarget.select()} />
          </label>
          <div className="lobby-actions">
            {canShare && (
              <button type="button" className="btn btn-primary" onClick={() => void share()}>
                Share invite
              </button>
            )}
            <button type="button" className={canShare ? 'btn btn-secondary' : 'btn btn-primary'} onClick={() => void copy()}>
              {copied ? 'Link copied' : 'Copy link'}
            </button>
          </div>
          <p className="muted">
            Or tell them the room code: <span className="room-code-inline">{lobby.code}</span>
          </p>
          <p className="waiting">Waiting for them to join…</p>
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
                <span>Room code</span>
                <input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setError(null);
                  }}
                  maxLength={4}
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

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button type="button" className="btn btn-secondary" onClick={onBack}>
        Back to menu
      </button>
    </main>
  );
}
