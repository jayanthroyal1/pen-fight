import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { openRealtime } from '../net/link';
import { BackIcon } from '../platform/art';
import { InviteEntry } from '../platform/InviteEntry';
import { buzz, sfx } from '../platform/sfx';
import { SHEET_H, SHEET_W, paint, type InkOp, type Stroke } from './ink';
import { DrawRoom, type ChatLine, type DrawMember } from './room';
import { MIN_PLAYERS, type View } from './rules';
import './drawGame.css';

const NAME_KEY = 'wildplayers:doodle-name';
const COLORS = ['#14100c', '#ffffff', '#8a8f98', '#e0322b', '#ff6a13', '#ffc21a', '#3fae3a', '#18a5a0', '#2a6fdb', '#7a3fc9', '#e84f9c', '#8a5a2b'];
const SIZES = [5, 11, 22];
/** How often the drawer's new points are sent. */
const FLUSH_MS = 90;

function readName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Remembering is only a convenience.
  }
}

/** The room code this page was opened with, if any; taken out of the address so a reload doesn't rejoin. */
function takeInviteCode(): string {
  const url = new URL(location.href);
  const code = url.searchParams.get('draw') ?? '';
  if (code) {
    url.searchParams.delete('draw');
    history.replaceState(history.state, '', url.toString());
  }
  return code.toUpperCase();
}

/** The room this visit was invited to, until it's used or the player leaves. */
let openingCode = takeInviteCode();

const inviteLink = (code: string) => {
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set('draw', code);
  return url.toString();
};

/** Doodle Rush: online rooms where one player draws and the rest race to guess. */
export default function DrawGame({ onExit }: { onExit: () => void }) {
  const [room, setRoom] = useState<DrawRoom | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [choices, setChoices] = useState<string[]>([]);
  const inkRef = useRef<{ strokes: Stroke[]; op: InkOp | null; n: number }>({ strokes: [], op: null, n: 0 });
  const [inkTick, setInkTick] = useState(0);

  const leave = useCallback(() => {
    void room?.leave();
    setRoom(null);
    setView(null);
    setChat([]);
  }, [room]);

  useEffect(() => () => void room?.leave(), [room]);

  const enter = async (name: string, code: string | null): Promise<void> => {
    const rt = await openRealtime<DrawMember>();
    if (!rt) throw new Error('Online rooms aren’t set up on this site yet.');
    saveName(name);
    const next = new DrawRoom(rt, name, {
      view: setView,
      chat: (line) => {
        setChat((c) => [...c.slice(-60), line]);
        if (line.kind === 'right') sfx.right();
      },
      choices: setChoices,
      ink: (strokes, op) => {
        inkRef.current = { strokes, op, n: inkRef.current.n + 1 };
        setInkTick((n) => n + 1);
      },
    });
    if (code) await next.join(code);
    else await next.create();
    openingCode = '';
    setRoom(next);
  };

  const exit = () => {
    openingCode = '';
    sfx.back();
    leave();
    onExit();
  };

  return (
    <div className="wp-root dr-root">
      {!room || !view ? (
        <Entry onEnter={enter} onExit={exit} />
      ) : view.phase === 'lobby' ? (
        <Lobby room={room} view={view} onExit={exit} />
      ) : (
        <Table room={room} view={view} chat={chat} choices={choices} ink={inkRef} inkTick={inkTick} onExit={exit} />
      )}
    </div>
  );
}

function Top({ title, onExit }: { title: string; onExit: () => void }) {
  return (
    <header className="wp-top dr-top">
      <button type="button" className="wp-icon-btn" aria-label="Leave Doodle Rush" title="Leave Doodle Rush" onClick={onExit}>
        <BackIcon />
      </button>
      <p className="dr-name">{title}</p>
    </header>
  );
}

function Entry({ onEnter, onExit }: { onEnter: (name: string, code: string | null) => Promise<void>; onExit: () => void }) {
  const [name, setName] = useState(readName);
  const [code, setCode] = useState(openingCode);
  // Opened from a friend's invite: all that's left to do is say who you are and join.
  const [invited, setInvited] = useState(openingCode !== '');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const go = async (kind: 'create' | 'join') => {
    sfx.unlock();
    const clean = name.trim();
    if (!clean) {
      setError('Type your name first, so your friends know who’s drawing.');
      return;
    }
    if (kind === 'join' && !code.trim()) {
      setError('Type the four-letter room code from your friend.');
      return;
    }
    setError(null);
    setBusy(kind);
    try {
      await onEnter(clean.slice(0, 16), kind === 'join' ? code : null);
      sfx.tap();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Try again.');
      setBusy(null);
    }
  };

  const nameField = (
    <label className="dr-field">
      <span>Your name</span>
      <input value={name} maxLength={16} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
    </label>
  );
  const problem = error && (
    <p className="dr-error" role="alert">
      {error}
    </p>
  );

  if (invited) {
    return (
      <InviteEntry
        game="Doodle Rush"
        code={code}
        name={name}
        onName={setName}
        joining={busy === 'join'}
        error={error}
        onJoin={() => void go('join')}
        onCreate={() => {
          setInvited(false);
          setCode('');
          setError(null);
        }}
        onExit={onExit}
      />
    );
  }

  return (
    <main className="wp-page">
      <div className="wp-wrap dr-wrap">
        <Top title="Doodle Rush" onExit={onExit} />
        <section className="dr-panel">
          <h1 className="dr-title">Draw it. Guess it. Fast.</h1>
          <p className="dr-lead">One player draws a word. Everyone else races to type it. The quicker the guess, the bigger the score.</p>
          {nameField}
          <button type="button" className="wp-play" onClick={() => void go('create')}>
            {busy === 'create' ? 'Making your room…' : 'Create a room'}
          </button>
        </section>
        <section className="dr-panel">
          <label className="dr-field">
            <span>Got a room code?</span>
            <input
              value={code}
              maxLength={4}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </label>
          <button type="button" className="dr-btn" onClick={() => void go('join')}>
            {busy === 'join' ? 'Joining…' : 'Join room'}
          </button>
        </section>
        {problem}
      </div>
    </main>
  );
}

function Lobby({ room, view, onExit }: { room: DrawRoom; view: View; onExit: () => void }) {
  const [note, setNote] = useState<string | null>(null);
  const enough = view.players.length >= MIN_PLAYERS;

  const share = async () => {
    const url = inviteLink(room.code);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Doodle Rush', text: `Join my Doodle Rush room: ${room.code}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNote('Invite link copied.');
    } catch {
      setNote(`Your room code is ${room.code}.`);
    }
  };

  return (
    <main className="wp-page">
      <div className="wp-wrap dr-wrap">
        <Top title="Doodle Rush" onExit={onExit} />
        <section className="dr-panel">
          <p className="dr-label">Room code</p>
          <p className="dr-code">{room.code}</p>
          <button type="button" className="dr-btn" onClick={() => void share()}>
            Invite friends
          </button>
          {note && (
            <p className="dr-lead" role="status">
              {note}
            </p>
          )}
        </section>
        <section className="dr-panel" aria-label="Players">
          <p className="dr-label">Players ({view.players.length} of 8)</p>
          <ul className="dr-roster">
            {view.players.map((p) => (
              <li key={p.id}>
                {p.name}
                {p.id === room.id && <span> (you)</span>}
              </li>
            ))}
          </ul>
          {room.isHost ? (
            <button
              type="button"
              className="wp-play"
              onClick={() => {
                if (!enough) {
                  setNote('You need at least one friend in the room. Invite someone first.');
                  return;
                }
                sfx.launch();
                room.start();
              }}
            >
              Start game
            </button>
          ) : (
            <p className="dr-lead">Waiting for the host to start the game.</p>
          )}
        </section>
      </div>
    </main>
  );
}

interface TableProps {
  room: DrawRoom;
  view: View;
  chat: ChatLine[];
  choices: string[];
  ink: React.MutableRefObject<{ strokes: Stroke[]; op: InkOp | null; n: number }>;
  inkTick: number;
  onExit: () => void;
}

/** Counts down from the last time the host said how long is left. */
function useSecondsLeft(view: View): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const end = Date.now() + view.left;
    const update = () => setSeconds(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [view]);
  return seconds;
}

function Table({ room, view, chat, choices, ink, inkTick, onExit }: TableProps) {
  const seconds = useSecondsLeft(view);
  const drawing = view.drawerId === room.id;
  const drawer = view.players.find((p) => p.id === view.drawerId);
  const guessedIt = view.guessed.includes(room.id);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const ranked = useMemo(() => [...view.players].sort((a, b) => b.score - a.score), [view.players]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [chat]);

  useEffect(() => {
    if (view.phase === 'drawing' && seconds > 0 && seconds <= 5) sfx.hover();
  }, [seconds, view.phase]);

  const headline =
    view.phase === 'drawing'
      ? drawing
        ? 'Your word'
        : `${drawer?.name ?? 'Someone'} is drawing`
      : view.phase === 'choosing'
        ? `${drawer?.name ?? 'Someone'} is choosing`
        : '';

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const said = text.trim();
    if (!said) return;
    room.sendGuess(said);
    setText('');
  };

  return (
    <main className="dr-table">
      <header className="dr-bar">
        <button type="button" className="wp-icon-btn" aria-label="Leave Doodle Rush" title="Leave Doodle Rush" onClick={onExit}>
          <BackIcon />
        </button>
        <div className="dr-word">
          <span className="dr-label">
            Round {view.round} of {view.rounds} · {headline}
          </span>
          <strong className="dr-mask" aria-live="polite">
            {drawing && view.phase === 'drawing' ? room.secretWord : view.mask.split('').join(' ')}
          </strong>
        </div>
        <span className={`dr-clock${seconds <= 10 && view.phase === 'drawing' ? ' is-low' : ''}`} role="timer">
          {seconds}
        </span>
      </header>

      <div className="dr-stage">
        <Sheet room={room} drawing={drawing && view.phase === 'drawing'} color={color} size={size} ink={ink} inkTick={inkTick} />

        {view.phase === 'choosing' && drawing && (
          <div className="dr-cover">
            <p className="dr-cover-title">Pick a word to draw</p>
            <div className="dr-picks">
              {choices.map((w) => (
                <button
                  key={w}
                  type="button"
                  className="dr-btn"
                  onClick={() => {
                    sfx.tap();
                    buzz(15);
                    room.setSecret(w);
                    room.pick(w);
                  }}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        )}
        {view.phase === 'choosing' && !drawing && (
          <div className="dr-cover">
            <p className="dr-cover-title">{drawer?.name ?? 'Someone'} is picking a word…</p>
          </div>
        )}
        {view.phase === 'reveal' && (
          <div className="dr-cover">
            <p className="dr-label">The word was</p>
            <p className="dr-cover-word">{view.word ?? '…'}</p>
          </div>
        )}
        {view.phase === 'over' && (
          <div className="dr-cover dr-final">
            <p className="dr-cover-word">{ranked[0]?.name ?? 'Nobody'} wins!</p>
            <ol className="dr-final-list">
              {ranked.map((p) => (
                <li key={p.id}>
                  <span>{p.name}</span>
                  <strong>{p.score}</strong>
                </li>
              ))}
            </ol>
            {room.isHost ? (
              <button type="button" className="wp-play" onClick={() => room.playAgain()}>
                Play again
              </button>
            ) : (
              <p className="dr-lead">Waiting for the host to play again.</p>
            )}
          </div>
        )}
      </div>

      <ul className="dr-scores" aria-label="Scores">
        {view.players.map((p) => (
          <li key={p.id} className={`${p.id === view.drawerId ? 'is-drawer' : ''}${view.guessed.includes(p.id) ? ' is-in' : ''}`}>
            <span>{p.name}</span>
            <strong>{p.score}</strong>
          </li>
        ))}
      </ul>

      {drawing && view.phase === 'drawing' ? (
        <div className="dr-tools" role="toolbar" aria-label="Drawing tools">
          <div className="dr-colors">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`dr-color${c === color ? ' is-on' : ''}`}
                style={{ background: c }}
                aria-label={`Use colour ${c}`}
                aria-pressed={c === color}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <div className="dr-tool-row">
            {SIZES.map((s) => (
              <button key={s} type="button" className={`dr-size${s === size ? ' is-on' : ''}`} aria-label={`Brush size ${s}`} aria-pressed={s === size} onClick={() => setSize(s)}>
                <span style={{ width: s, height: s }} />
              </button>
            ))}
            <button type="button" className="dr-btn" onClick={() => room.draw({ k: 'undo' })}>
              Undo
            </button>
            <button type="button" className="dr-btn" onClick={() => room.draw({ k: 'clear' })}>
              Clear
            </button>
          </div>
        </div>
      ) : (
        <div className="dr-talk">
          <div className="dr-log" ref={logRef} aria-live="polite">
            {chat.map((line, i) => (
              <p key={i} className={`dr-line is-${line.kind}`}>
                {line.name && <b>{line.name} </b>}
                {line.text}
              </p>
            ))}
          </div>
          <form className="dr-guess" onSubmit={send}>
            <input
              value={text}
              maxLength={60}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Your guess"
              placeholder={guessedIt ? 'You got it. Nice!' : 'Type your guess'}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" className="wp-play dr-send">
              Guess
            </button>
          </form>
        </div>
      )}
    </main>
  );
}

function Sheet({ room, drawing, color, size, ink, inkTick }: { room: DrawRoom; drawing: boolean; color: string; size: number; ink: TableProps['ink']; inkTick: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painted = useRef<{ count: number; points: number }>({ count: 0, points: 0 });
  const pending = useRef<{ id: string; points: number[]; sent: number } | null>(null);
  const brush = useRef({ color, size });
  brush.current = { color, size };

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.setTransform(canvas.width / SHEET_W, 0, 0, canvas.height / SHEET_H, 0, 0);
    const { strokes } = ink.current;
    strokes.forEach((s) => paint(g, s));
    const last = strokes[strokes.length - 1];
    painted.current = { count: strokes.length, points: last?.points.length ?? 0 };
  }, [ink]);

  // A sharp canvas at any screen size.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const fit = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * scale);
      canvas.height = Math.round(canvas.clientHeight * scale);
      repaint();
    };
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    fit();
    return () => observer.disconnect();
  }, [repaint]);

  // New ink: paint only what's new, unless strokes were taken away.
  useEffect(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    const { strokes, op } = ink.current;
    if (!g || !op || op.k !== 'add' || strokes.length < painted.current.count) {
      repaint();
      return;
    }
    const last = strokes[strokes.length - 1];
    const same = strokes.length === painted.current.count;
    paint(g, last, same ? painted.current.points : 0);
    painted.current = { count: strokes.length, points: last.points.length };
  }, [inkTick, ink, repaint]);

  // Send the drawer's points in small batches.
  useEffect(() => {
    if (!drawing) return;
    const id = window.setInterval(() => flush(), FLUSH_MS);
    return () => window.clearInterval(id);
  });

  const flush = () => {
    const p = pending.current;
    if (!p || p.sent >= p.points.length) return;
    room.draw({ k: 'add', id: p.id, color: brush.current.color, width: brush.current.size, points: p.points.slice(p.sent) });
    p.sent = p.points.length;
  };

  const toSheet = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * SHEET_W), Math.round(((e.clientY - r.top) / r.height) * SHEET_H)];
  };

  return (
    <canvas
      ref={canvasRef}
      className={`dr-sheet${drawing ? ' is-mine' : ''}`}
      aria-label="The drawing"
      onPointerDown={(e) => {
        if (!drawing) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        pending.current = { id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`, points: toSheet(e), sent: 0 };
        flush();
      }}
      onPointerMove={(e) => {
        const p = pending.current;
        if (!drawing || !p) return;
        const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
        const r = e.currentTarget.getBoundingClientRect();
        for (const c of events.length ? events : [e.nativeEvent]) {
          p.points.push(Math.round(((c.clientX - r.left) / r.width) * SHEET_W), Math.round(((c.clientY - r.top) / r.height) * SHEET_H));
        }
      }}
      onPointerUp={() => {
        flush();
        pending.current = null;
      }}
      onPointerCancel={() => {
        flush();
        pending.current = null;
      }}
    />
  );
}
