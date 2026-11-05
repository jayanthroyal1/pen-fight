import { useCallback, useEffect, useRef, useState } from 'react';
import { BackIcon, SoundIcon } from '../platform/art';
import { buzz, sfx } from '../platform/sfx';
import { drawFrame } from './draw';
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

/** Wolf Run: an endless run. Tap to jump, tap again in the air to jump higher. */
export default function WolfRun({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const runRef = useRef<Run>(newRun());
  const overAt = useRef(0);
  const [phase, setPhase] = useState<Run['phase']>('ready');
  const [best, setBest] = useState(readBest);
  const [last, setLast] = useState({ score: 0, isBest: false });
  const [muted, setMuted] = useState(sfx.muted);

  const press = useCallback(() => {
    sfx.unlock();
    const r = runRef.current;
    if (r.phase === 'over' && performance.now() - overAt.current < RESTART_DELAY_MS) return;
    if (r.phase !== 'running') {
      runRef.current = { ...newRun(), phase: 'running' };
      setPhase('running');
      jump(runRef.current);
      sfx.hop();
      return;
    }
    if (jump(r)) {
      sfx.hop();
      buzz(8);
    }
  }, []);

  const letGo = useCallback(() => release(runRef.current), []);

  // Space and the up arrow work like a tap.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.repeat || (e.code !== 'Space' && e.code !== 'ArrowUp')) return;
      // Keep a focused button's own Space press for that button.
      if (document.activeElement instanceof HTMLButtonElement) return;
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
        step(r, STEP, viewW);
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
      drawFrame(g, r, canvas.width, canvas.height, viewW, time);
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
          <span className="wr-best">Best {best}</span>
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

      {phase === 'ready' && (
        <button type="button" className="wr-card" onClick={press} autoFocus>
          <span className="wr-title">Wolf Run</span>
          <span className="wr-help">Tap to jump. Tap again in the air to jump higher. Stay low under the owls.</span>
          <span className="wr-go">Tap to run</span>
        </button>
      )}
      {phase === 'over' && (
        <button type="button" className="wr-card" onClick={press} autoFocus>
          <span className="wr-title">{last.isBest ? 'New best!' : 'Game over'}</span>
          <span className="wr-final">{last.score}</span>
          <span className="wr-go">Run again</span>
        </button>
      )}
    </div>
  );
}
