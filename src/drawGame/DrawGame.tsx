import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { openRealtime } from '../net/link';
import { BackIcon } from '../platform/art';
import { InviteEntry } from '../platform/InviteEntry';
import { playerName, savePlayerName } from '../platform/player';
import { buzz, sfx } from '../platform/sfx';
import { Brush, SHEET_H, SHEET_W, paint, type InkOp, type Stroke } from './ink';
import { DrawRoom, type ChatLine, type DrawMember } from './room';
import { MIN_PLAYERS, ROUND_CHOICES, SECOND_CHOICES, type View } from './rules';
import './drawGame.css';

const COLORS = [
  '#14100c', '#8a8f98', '#ffffff', '#f2c9a0', '#8a5a2b', '#8e1b2e', '#e0322b', '#ff6a13',
  '#ffc21a', '#8fd14f', '#3fae3a', '#18a5a0', '#57b8f2', '#2a6fdb', '#7a3fc9', '#e84f9c',
];
const MIN_SIZE = 3;
const MAX_SIZE = 44;
const PAPER = '#ffffff';
/** The eraser works wider than the brush at the same setting. */
const ERASER_SCALE = 1.8;
/** How often the drawer's new points go out to the others. Their own sheet doesn't wait for this. */
const FLUSH_MS = 90;
/** How long Clear waits for its second tap. */
const CLEAR_WAIT_MS = 2500;

type Tool = 'brush' | 'fill' | 'eraser';

interface Ink {
  strokes: Stroke[];
  op: InkOp | null;
  /** Paints what just changed, straight away and without a React render. */
  paint?: () => void;
}

function ToolIcon({ name }: { name: Tool | 'undo' | 'redo' | 'clear' }) {
  const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      {name === 'brush' && <path {...line} d="M4 20c3 0 5-1 5-4l9-11 3 3-11 9c-1 2-3 3-6 3z" />}
      {name === 'fill' && <path {...line} d="M11 3l8 8-7 7a2 2 0 0 1-3 0l-5-5a2 2 0 0 1 0-3zM4 12h15M20 16s2 2.4 2 3.6a2 2 0 0 1-4 0c0-1.2 2-3.6 2-3.6z" />}
      {name === 'eraser' && <path {...line} d="M8 20h12M5 15l9-10 6 6-9 9H9zM9 10l6 6" />}
      {name === 'undo' && <path {...line} d="M8 5L3 10l5 5M3 10h11a6 6 0 0 1 0 12h-3" />}
      {name === 'redo' && <path {...line} d="M16 5l5 5-5 5M21 10H10a6 6 0 0 0 0 12h3" />}
      {name === 'clear' && <path {...line} d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5" />}
    </svg>
  );
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
  const inkRef = useRef<Ink>({ strokes: [], op: null });

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
    savePlayerName(name);
    const next = new DrawRoom(rt, name, {
      view: setView,
      chat: (line) => {
        setChat((c) => [...c.slice(-60), line]);
        if (line.kind === 'right') sfx.right();
      },
      choices: setChoices,
      ink: (strokes, op) => {
        inkRef.current.strokes = strokes;
        inkRef.current.op = op;
        inkRef.current.paint?.();
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
        <Table room={room} view={view} chat={chat} choices={choices} ink={inkRef} onExit={exit} />
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
  const [name, setName] = useState(playerName);
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
        <section className="dr-panel" aria-label="Game settings">
          {room.isHost ? (
            <>
              <Choice label="Rounds" options={ROUND_CHOICES} value={view.rounds} onPick={(n) => room.settings(n, view.drawMs / 1000)} />
              <Choice label="Seconds to draw" options={SECOND_CHOICES} value={view.drawMs / 1000} onPick={(n) => room.settings(view.rounds, n)} />
            </>
          ) : (
            <p className="dr-lead">
              {view.rounds} rounds, {view.drawMs / 1000} seconds to draw.
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

function Choice({ label, options, value, onPick }: { label: string; options: number[]; value: number; onPick: (n: number) => void }) {
  return (
    <div className="dr-choice" role="group" aria-label={label}>
      <span className="dr-label">{label}</span>
      <div className="dr-seg">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            className={n === value ? 'is-on' : ''}
            aria-pressed={n === value}
            onClick={() => {
              sfx.tap();
              onPick(n);
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The top three on steps, the winner in the middle and highest. */
function Podium({ ranked }: { ranked: View['players'] }) {
  return (
    <ol className="dr-podium">
      {ranked.slice(0, 3).map((p, i) => (
        <li key={p.id} className={`is-place-${i + 1}`}>
          <span className="dr-podium-name">{p.name}</span>
          <strong>{p.score}</strong>
          <span className="dr-podium-step">{i + 1}</span>
        </li>
      ))}
    </ol>
  );
}

interface TableProps {
  room: DrawRoom;
  view: View;
  chat: ChatLine[];
  choices: string[];
  ink: React.MutableRefObject<Ink>;
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

function Table({ room, view, chat, choices, ink, onExit }: TableProps) {
  const seconds = useSecondsLeft(view);
  const drawing = view.drawerId === room.id;
  const drawer = view.players.find((p) => p.id === view.drawerId);
  const guessedIt = view.guessed.includes(room.id);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(11);
  const [tool, setTool] = useState<Tool>('brush');
  // Undo and Redo light up as the drawing changes.
  const [, refreshTools] = useState(0);
  const [clearing, setClearing] = useState(false);
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const ranked = useMemo(() => [...view.players].sort((a, b) => b.score - a.score), [view.players]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [chat]);

  useEffect(() => {
    if (view.phase === 'drawing' && seconds > 0 && seconds <= 10) sfx.hover();
  }, [seconds, view.phase]);

  // Your turn to draw, and the end of the game, shouldn't pass unnoticed.
  useEffect(() => {
    if (view.phase === 'choosing' && drawing) {
      sfx.open();
      buzz(30);
    }
    if (view.phase === 'over') sfx.launch();
  }, [view.phase, drawing, view.round]);

  const headline =
    view.phase === 'drawing'
      ? drawing
        ? 'Your word'
        : `${drawer?.name ?? 'Someone'} is drawing`
      : view.phase === 'choosing'
        ? `${drawer?.name ?? 'Someone'} is choosing`
        : '';

  useEffect(() => {
    if (!clearing) return;
    const id = window.setTimeout(() => setClearing(false), CLEAR_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [clearing]);

  const tied = ranked.length > 1 && ranked[0].score === ranked[1].score;
  const gains = ranked.filter((p) => view.gained[p.id] > 0).sort((a, b) => view.gained[b.id] - view.gained[a.id]);
  // How long the word is: "6", or "4 + 8" for two words.
  const letters = view.mask.split(' ').filter(Boolean).map((w) => w.length).join(' + ');

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
          <div className="dr-mask-row">
            <strong className="dr-mask" aria-live="polite">
              {drawing && view.phase === 'drawing' ? room.secretWord : view.mask.split('').join(' ')}
            </strong>
            {view.phase === 'drawing' && !drawing && <span className="dr-count">{letters}</span>}
          </div>
        </div>
        <span className={`dr-clock${seconds <= 10 && view.phase === 'drawing' ? ' is-low' : ''}`} role="timer">
          {seconds}
        </span>
      </header>

      <div className="dr-stage">
        <Sheet room={room} drawing={drawing && view.phase === 'drawing'} tool={tool} color={color} size={size} ink={ink} onMark={() => refreshTools((n) => n + 1)} />

        {view.phase === 'choosing' && drawing && (
          <div className="dr-cover">
            <p className="dr-cover-title">Your turn! Pick a word</p>
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
            {gains.length > 0 ? (
              <ul className="dr-gains">
                {gains.map((p) => (
                  <li key={p.id}>
                    <span>{p.name}</span>
                    <strong>+{view.gained[p.id]}</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dr-lead">Nobody got this one.</p>
            )}
          </div>
        )}
        {view.phase === 'over' && (
          <div className="dr-cover dr-final">
            <p className="dr-cover-title">{tied ? 'It’s a tie!' : `${ranked[0]?.name ?? 'Nobody'} wins!`}</p>
            <Podium ranked={ranked} />
            {ranked.length > 3 && (
              <ol className="dr-final-list" start={4}>
                {ranked.slice(3).map((p) => (
                  <li key={p.id}>
                    <span>{p.name}</span>
                    <strong>{p.score}</strong>
                  </li>
                ))}
              </ol>
            )}
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
          <div className="dr-ticker" aria-live="polite">
            {chat.length === 0 && <p className="dr-line is-info">Guesses appear here.</p>}
            {chat.slice(-2).map((line, i) => (
              <p key={chat.length - i} className={`dr-line is-${line.kind}`}>
                {line.name && <b>{line.name} </b>}
                {line.text}
              </p>
            ))}
          </div>
          <div className="dr-colors">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`dr-color${c === color && tool !== 'eraser' ? ' is-on' : ''}`}
                style={{ background: c }}
                aria-label={`Use colour ${c}`}
                aria-pressed={c === color && tool !== 'eraser'}
                onClick={() => {
                  setColor(c);
                  if (tool === 'eraser') setTool('brush');
                }}
              />
            ))}
          </div>
          <label className="dr-size-row">
            <span className="dr-size-dot" aria-hidden>
              <i style={{ width: Math.max(3, size * 0.7), height: Math.max(3, size * 0.7), background: tool === 'eraser' ? PAPER : color }} />
            </span>
            <span className="dr-sr">Brush size</span>
            <input type="range" min={MIN_SIZE} max={MAX_SIZE} value={size} onChange={(e) => setSize(Number(e.target.value))} />
          </label>
          <div className="dr-tool-row">
            {(['brush', 'fill', 'eraser'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`dr-tool${tool === t ? ' is-on' : ''}`}
                aria-pressed={tool === t}
                aria-label={t === 'brush' ? 'Brush' : t === 'fill' ? 'Fill with colour' : 'Eraser'}
                title={t === 'brush' ? 'Brush' : t === 'fill' ? 'Fill with colour' : 'Eraser'}
                onClick={() => {
                  sfx.tap();
                  setTool(t);
                }}
              >
                <ToolIcon name={t} />
              </button>
            ))}
            <button
              type="button"
              className="dr-tool"
              aria-label="Undo"
              title="Undo"
              disabled={!room.canUndo}
              onClick={() => {
                room.undo();
                refreshTools((n) => n + 1);
              }}
            >
              <ToolIcon name="undo" />
            </button>
            <button
              type="button"
              className="dr-tool"
              aria-label="Redo"
              title="Redo"
              disabled={!room.canRedo}
              onClick={() => {
                room.redo();
                refreshTools((n) => n + 1);
              }}
            >
              <ToolIcon name="redo" />
            </button>
            <button
              type="button"
              className={`dr-tool${clearing ? ' is-warn' : ''}`}
              aria-label={clearing ? 'Tap again to clear the sheet' : 'Clear the sheet'}
              title={clearing ? 'Tap again to clear' : 'Clear'}
              onClick={() => {
                if (!clearing) {
                  setClearing(true);
                  return;
                }
                setClearing(false);
                room.forgetRedo();
                room.draw({ k: 'clear' });
                refreshTools((n) => n + 1);
              }}
            >
              {clearing ? 'Sure?' : <ToolIcon name="clear" />}
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

interface SheetProps {
  room: DrawRoom;
  drawing: boolean;
  tool: Tool;
  color: string;
  size: number;
  ink: TableProps['ink'];
  onMark: () => void;
}

interface Line {
  id: string;
  color: string;
  width: number;
  brush: Brush;
  points: number[];
  press: number[];
  /** How many points have gone out to the others. */
  sent: number;
}

function Sheet({ room, drawing, tool, color, size, ink, onMark }: SheetProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const painted = useRef<{ count: number; points: number }>({ count: 0, points: 0 });
  const line = useRef<Line | null>(null);

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = PAPER;
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
    const holder = ink.current;
    holder.paint = () => {
      const g = canvasRef.current?.getContext('2d');
      const { strokes, op } = holder;
      const adds = op?.k === 'add' || op?.k === 'fill' || op?.k === 'put';
      if (!g || !adds || strokes.length < painted.current.count) {
        repaint();
        return;
      }
      const last = strokes[strokes.length - 1];
      const same = strokes.length === painted.current.count;
      paint(g, last, same ? painted.current.points : 0);
      painted.current = { count: strokes.length, points: last.points.length };
    };
    repaint();
    return () => {
      holder.paint = undefined;
    };
  }, [ink, repaint]);

  const flush = useCallback(() => {
    const l = line.current;
    if (!l || l.sent * 2 >= l.points.length) return;
    room.inkOut({ k: 'add', id: l.id, color: l.color, width: l.width, points: l.points.slice(l.sent * 2), press: l.press.slice(l.sent) });
    l.sent = l.press.length;
  }, [room]);

  // Send the drawer's points in small batches.
  useEffect(() => {
    if (!drawing) return;
    const id = window.setInterval(flush, FLUSH_MS);
    return () => window.clearInterval(id);
  }, [drawing, flush]);

  /** New points go on this player's own sheet at once. */
  const extend = (l: Line, more: { points: number[]; press: number[] }) => {
    if (more.press.length === 0) return;
    l.points.push(...more.points);
    l.press.push(...more.press);
    room.inkHere({ k: 'add', id: l.id, color: l.color, width: l.width, ...more });
  };

  const toSheet = (e: { clientX: number; clientY: number }, box: DOMRect): [number, number] => [((e.clientX - box.left) / box.width) * SHEET_W, ((e.clientY - box.top) / box.height) * SHEET_H];

  const finish = (x?: number, y?: number) => {
    const l = line.current;
    if (!l) return;
    if (x !== undefined && y !== undefined) extend(l, l.brush.end(x, y));
    flush();
    line.current = null;
    onMark();
  };

  return (
    <canvas
      ref={canvasRef}
      className={`dr-sheet${drawing ? ' is-mine' : ''}`}
      aria-label="The drawing"
      onPointerDown={(e) => {
        // A palm or a second finger resting on the sheet shouldn't draw.
        if (!drawing || !e.isPrimary || line.current) return;
        e.preventDefault();
        const [x, y] = toSheet(e, e.currentTarget.getBoundingClientRect());
        const id = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
        room.forgetRedo();
        if (tool === 'fill') {
          sfx.tap();
          room.draw({ k: 'fill', id, color, x: Math.round(x), y: Math.round(y) });
          onMark();
          return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        // A stylus turned over to its eraser end erases.
        const erasing = tool === 'eraser' || (e.buttons & 32) !== 0;
        const brush = new Brush(x, y, e.timeStamp, erasing);
        const l: Line = { id, color: erasing ? PAPER : color, width: erasing ? size * ERASER_SCALE : size, brush, points: [], press: [], sent: 0 };
        line.current = l;
        extend(l, brush.start());
        flush();
      }}
      onPointerMove={(e) => {
        const l = line.current;
        if (!drawing || !l || !e.isPrimary) return;
        const box = e.currentTarget.getBoundingClientRect();
        const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
        const more: { points: number[]; press: number[] } = { points: [], press: [] };
        for (const c of events.length ? events : [e.nativeEvent]) {
          const [x, y] = toSheet(c, box);
          const next = l.brush.move(x, y, c.timeStamp, c.pointerType === 'pen' ? c.pressure : 0);
          more.points.push(...next.points);
          more.press.push(...next.press);
        }
        extend(l, more);
      }}
      onPointerUp={(e) => {
        const [x, y] = toSheet(e, e.currentTarget.getBoundingClientRect());
        finish(x, y);
      }}
      onPointerCancel={() => finish()}
      onLostPointerCapture={() => finish()}
    />
  );
}
