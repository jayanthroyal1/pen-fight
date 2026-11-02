import { useEffect, useRef, useState } from 'react';
import { penModel, type PenModelId } from '../game/pens';
import type { PlayerId } from '../game/types';
import { OnlineClient } from '../net/client';

interface Props {
  model: PenModelId;
  onStart: (client: OnlineClient, me: PlayerId, models: [PenModelId, PenModelId]) => void;
  onBack: () => void;
}

type LobbyState =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'waiting'; code: string };

export function OnlineLobby({ model, onStart, onBack }: Props) {
  const [lobby, setLobby] = useState<LobbyState>({ kind: 'idle' });
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<OnlineClient | null>(null);
  const startedRef = useRef(false);

  useEffect(
    () => () => {
      if (!startedRef.current) clientRef.current?.close();
    },
    [],
  );

  const connect = (): OnlineClient => {
    clientRef.current?.close();
    const client = new OnlineClient();
    clientRef.current = client;
    client.subscribe((msg) => {
      if (msg.t === 'created') setLobby({ kind: 'waiting', code: msg.code });
      else if (msg.t === 'error') {
        setError(msg.message);
        setLobby({ kind: 'idle' });
      } else if (msg.t === 'peer-left' && !startedRef.current) {
        setError('Lost the connection to the game server. Try again.');
        setLobby({ kind: 'idle' });
      } else if (msg.t === 'start') {
        startedRef.current = true;
        onStart(client, msg.you, msg.models);
      }
    });
    return client;
  };

  const run = async (msg: Parameters<OnlineClient['send']>[0]) => {
    setError(null);
    setLobby({ kind: 'connecting' });
    try {
      await connect().send(msg);
    } catch {
      setError("Couldn't reach the game server. Check it's running (npm run server) and try again.");
      setLobby({ kind: 'idle' });
    }
  };

  const onJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 4) {
      setError('Room codes are 4 letters. Check the code with your friend.');
      return;
    }
    void run({ t: 'join', code: trimmed, model });
  };

  return (
    <main className="menu paper">
      <h1>Play online</h1>
      <p className="tagline">Your pen: {penModel(model).name}</p>

      {lobby.kind === 'waiting' ? (
        <section className="lobby-wait" aria-live="polite">
          <p>Share this code with your friend:</p>
          <p className="room-code">{lobby.code}</p>
          <p className="muted">Waiting for them to join…</p>
        </section>
      ) : (
        <div className="lobby">
          <section className="lobby-panel">
            <h2>Start a new room</h2>
            <p className="muted">You get a code to send to your friend.</p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={lobby.kind === 'connecting'}
              onClick={() => void run({ t: 'create', model })}
            >
              Create room
            </button>
          </section>

          <form className="lobby-panel" onSubmit={onJoin}>
            <h2>Join a friend</h2>
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
            <button type="submit" className="btn btn-secondary" disabled={lobby.kind === 'connecting'}>
              Join room
            </button>
          </form>
        </div>
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
