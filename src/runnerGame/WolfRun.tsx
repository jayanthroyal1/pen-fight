import { useCallback, useEffect, useRef, useState } from 'react';
import { BackIcon, SoundIcon } from '../platform/art';
import { playerId, playerName, savePlayerName } from '../platform/player';
import { buzz, sfx } from '../platform/sfx';
import { fetchBoard, submitScore, type Board } from './board';
import { drawFrame } from './draw';
import { WolfRig } from './rig';
import { jump, newRun, release, score, step, viewWidth, type Run } from './sim';
import './wolfRun.css';

const BEST_KEY = 'wildplayers:wolf-run-best';
const STEP = 1 / 120;
/** A little beat after crashing, so a panicked tap doesn't start the next run by accident. */
const RESTART_DELAY_MS = 450;
/** Every this many points, a small reward sound. */
const MILESTONE = 500;

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(best: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    // Remembering is only a convenience.
  }
}

function Crown() {
  return (
    <svg className="wr-crown" viewBox="0 0 24 18" width="20" height="15" aria-hidden>
      <polygon points="2,16 0,4 7,9 12,0 17,9 24,4 22,16" fill="currentColor" />
    </svg>
  );
}

/** Everyone's best scores, the leader crowned, and this player marked. */
function Leaderboard({ board, loading }: { board: Board | null; loading: boolean }) {
  if (!board) {
    return <p className="wr-board-note">{loading ? 'Loading top scores…' : 'Top scores aren’t available right now.'}</p>;
  }
  if (board.top.length === 0) return <p className="wr-board-note">No scores yet. Be the first on the board.</p>;
  const onList = board.top.some((r) => r.me);
  return (
    <div className="wr-board">
      <p className="wr-board-title">Top scores</p>
      <ol className="wr-rows">
        {board.top.map((r, i) => (
          <li key={`${i}-${r.name}`} className={`${i === 0 ? 'is-first' : ''}${r.me ? ' is-me' : ''}`}>
            <span className="wr-place">{i === 0 ? <Crown /> : i + 1}</span>
            <span className="wr-who">
              {r.name}
              {r.me && ' (you)'}
            </span>
            <strong>{r.score}</strong>
          </li>
        ))}
      </ol>
      {!onList && board.rank && (
        <p className="wr-board-note">
          You’re number {board.rank} of {board.players}.
        </p>
      )}
    </div>
  );
}

/** Wolf Run: an endless run. Tap to jump, tap again in the air to jump higher. */
export default function WolfRun({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const runRef = useRef<Run>(newRun());
  const rigRef = useRef(new WolfRig());
  const overAt = useRef(0);
  const [phase, setPhase] = useState<Run['phase']>('ready');
  const [best, setBest] = useState(readBest);
  const [last, setLast] = useState({ score: 0, isBest: false });
  const [muted, setMuted] = useState(sfx.muted);
  const [board, setBoard] = useState<Board | null>(null);
  const [boardLoading, setBoardLoading] = useState(true);
  const [name, setName] = useState(playerName);
  const [named, setNamed] = useState(() => playerName() !== '');

  // Opening the game also saves a best score that couldn't be sent at the time.
  useEffect(() => {
    let live = true;
    const known = playerName();
    const saved = readBest();
    const load = known && saved > 0 ? submitScore(playerId(), known, saved) : fetchBoard(playerId());
    void load.then((b) => {
      if (!live) return;
      setBoard(b);
      setBoardLoading(false);
    });
    return () => {
      live = false;
    };
  }, []);

  // After a run: send a new best, and show how everyone stands now.
  useEffect(() => {
    if (phase !== 'over') return;
    let live = true;
    const known = playerName();
    const load = known && last.isBest ? submitScore(playerId(), known, last.score) : fetchBoard(playerId());
    void load.then((b) => {
      if (live && b) setBoard(b);
    });
    return () => {
      live = false;
    };
  }, [phase, last]);

  const saveName = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim().slice(0, 16);
    if (!clean) return;
    savePlayerName(clean);
    setNamed(true);
    sfx.tap();
    void submitScore(playerId(), clean, readBest()).then((b) => {
      if (b) setBoard(b);
    });
  };

  const press = useCallback(() => {
    sfx.unlock();
    const r = runRef.current;
    if (r.phase === 'over' && performance.now() - overAt.current < RESTART_DELAY_MS) return;
    if (r.phase !== 'running') {
      runRef.current = { ...newRun(), phase: 'running' };
      rigRef.current.reset();
      setPhase('running');
      jump(runRef.current);
      rigRef.current.jumped();
      sfx.hop();
      return;
    }
    if (jump(r)) {
      rigRef.current.jumped();
      sfx.hop();
      buzz(8);
    }
  }, []);

  const letGo = useCallback(() => release(runRef.current), []);

  // Space and the up arrow work like a tap.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || (e.code !== 'Space' && e.code !== 'ArrowUp')) return;
      // Keep Space for a focused button, or for typing a name.
      if (document.activeElement instanceof HTMLButtonElement || document.activeElement instanceof HTMLInputElement) return;
      e.preventDefault();
      press();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') letGo();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [press, letGo]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const g = canvas.getContext('2d', { alpha: false })!;
    let viewW = 520;
    const fit = () => {
      const scale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(canvas.clientWidth * scale);
      canvas.height = Math.round(canvas.clientHeight * scale);
      viewW = viewWidth(canvas.clientWidth, canvas.clientHeight);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    fit();

    let raf = 0;
    let before = performance.now();
    let spare = 0;
    let shown = -1;
    let time = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // A long gap (a call, a locked phone) must not teleport the wolf into a rock.
      const dt = Math.min(0.05, (now - before) / 1000);
      before = now;
      const r = runRef.current;
      // Only a run in progress moves on: the crash below must happen exactly once.
      spare = r.phase === 'running' ? spare + dt : 0;
      while (r.phase === 'running' && spare >= STEP) {
        spare -= STEP;
        const was = score(r);
        const landed = step(r, STEP, viewW);
        rigRef.current.update(STEP, r, landed);
        if (Math.floor(score(r) / MILESTONE) > Math.floor(was / MILESTONE)) sfx.right();
        if (runRef.current.phase === 'over') {
          spare = 0;
          overAt.current = performance.now();
          const points = score(r);
          const record = readBest();
          if (points > record) saveBest(points);
          setBest(Math.max(record, points));
          setLast({ score: points, isBest: points > record });
          setPhase('over');
          sfx.crash();
          buzz(120);
          break;
        }
      }
      time += r.phase === 'running' ? dt : 0;
      // Between runs the wolf still breathes, wags and finishes falling.
      if (runRef.current.phase !== 'running') rigRef.current.update(dt, runRef.current, false);
      drawFrame(g, runRef.current, rigRef.current, canvas.width, canvas.height, viewW, time);
      const points = score(r);
      if (points !== shown && scoreRef.current) {
        shown = points;
        scoreRef.current.textContent = String(points);
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="wp-root wr-root">
      <canvas
        ref={canvasRef}
        className="wr-canvas"
        aria-label="Wolf Run. Tap to jump."
        onPointerDown={press}
        onPointerUp={letGo}
        onPointerCancel={letGo}
      />

      <header className="wr-bar">
        <button
          type="button"
          className="wp-icon-btn"
          aria-label="Leave Wolf Run"
          title="Leave Wolf Run"
          onClick={() => {
            sfx.back();
            onExit();
          }}
        >
          <BackIcon />
        </button>
        <p className="wr-scores">
          <span ref={scoreRef} className="wr-score">
            0
          </span>
          <span className="wr-best">
            Best {best}
            {board?.top[0] && ` · Top ${board.top[0].score}`}
          </span>
        </p>
        <button
          type="button"
          className="wp-icon-btn"
          aria-pressed={!muted}
          aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
          title={muted ? 'Turn sound on' : 'Turn sound off'}
          onClick={(e) => {
            sfx.unlock();
            sfx.setMuted(!muted);
            setMuted(!muted);
            e.currentTarget.blur();
          }}
        >
          <SoundIcon muted={muted} />
        </button>
      </header>

      {phase !== 'running' && (
        <section className="wr-card" aria-label={phase === 'over' ? 'Run over' : 'Wolf Run'}>
          <div className="wr-main">
            {phase === 'ready' ? (
              <>
                <h1 className="wr-title">Wolf Run</h1>
                <p className="wr-help">Tap to jump. Tap again in the air to jump higher. Stay low under the owls.</p>
              </>
            ) : (
              <>
                <h1 className="wr-title">{last.isBest ? 'New best!' : 'Game over'}</h1>
                <p className="wr-final">{last.score}</p>
              </>
            )}
            {phase === 'over' && !named && board && (
              <form className="wr-name" onSubmit={saveName}>
                <label>
                  <span>Your name for the top scores</span>
                  <input value={name} maxLength={16} autoComplete="nickname" onChange={(e) => setName(e.target.value)} />
                </label>
                <button type="submit" className="wr-save">
                  Save
                </button>
              </form>
            )}
            <button type="button" className="wp-play wr-go" onClick={press} autoFocus>
              {phase === 'ready' ? 'Tap to run' : 'Run again'}
            </button>
          </div>
          <Leaderboard board={board} loading={boardLoading} />
        </section>
      )}
    </div>
  );
}
