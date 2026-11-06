import { useEffect, useRef } from 'react';
import type { GenreId } from './catalog';
import { stageTier } from './tier';
import { onceSeen, whileSeen } from './whileSeen';

/** Faceted art for each genre, cut in angles like the wolf in the logo. */
export function GenreArt({ id }: { id: GenreId }) {
  const shapes: Record<GenreId, React.ReactNode> = {
    action: (
      <>
        <polygon points="56,4 18,54 44,54 34,92 80,36 52,36" fill="currentColor" />
        <polygon points="56,4 18,54 44,54" fill="#fff" opacity="0.28" />
        <polygon points="12,20 30,26 20,34" fill="currentColor" opacity="0.55" />
        <polygon points="80,62 92,74 76,74" fill="currentColor" opacity="0.55" />
      </>
    ),
    adventure: (
      <>
        <polygon points="4,86 36,26 68,86" fill="currentColor" />
        <polygon points="36,26 68,86 40,86" fill="#000" opacity="0.22" />
        <polygon points="44,86 68,42 92,86" fill="currentColor" opacity="0.65" />
        <polygon points="36,26 28,41 36,45 44,41" fill="#fff" opacity="0.8" />
        <polygon points="68,12 68,42 71,42 71,22 86,17 71,12" fill="#fff" />
      </>
    ),
    office: (
      <>
        <polygon points="6,46 90,8 62,86 44,58" fill="currentColor" />
        <polygon points="90,8 44,58 62,86" fill="#000" opacity="0.2" />
        <polygon points="90,8 6,46 44,58" fill="#fff" opacity="0.24" />
        <polygon points="44,58 36,82 54,70" fill="currentColor" opacity="0.7" />
      </>
    ),
    simulation: (
      <>
        <polygon points="48,6 88,28 48,50 8,28" fill="#fff" opacity="0.85" />
        <polygon points="8,28 48,50 48,92 8,70" fill="currentColor" />
        <polygon points="88,28 48,50 48,92 88,70" fill="currentColor" opacity="0.62" />
        <polygon points="48,50 48,92 66,82 66,40" fill="#000" opacity="0.14" />
      </>
    ),
    puzzle: (
      <>
        <polygon points="10,30 34,30 30,14 46,6 62,14 58,30 84,30 84,52 96,48 96,72 84,68 84,90 10,90" fill="currentColor" />
        <polygon points="10,30 34,30 46,48 10,90" fill="#fff" opacity="0.22" />
        <polygon points="84,30 84,90 46,90 62,52" fill="#000" opacity="0.18" />
      </>
    ),
    online: (
      <>
        <polygon points="48,6 84,26 84,70 48,90 12,70 12,26" fill="currentColor" opacity="0.28" />
        <polygon points="48,6 62,26 62,70 48,90 34,70 34,26" fill="currentColor" opacity="0.7" />
        <polygon points="12,42 84,42 84,54 12,54" fill="currentColor" />
        <polygon points="48,6 84,26 62,26" fill="#fff" opacity="0.5" />
        <circle cx="48" cy="48" r="7" fill="#fff" />
      </>
    ),
  };
  return (
    <svg className="wp-genre-art" viewBox="0 0 96 96" aria-hidden>
      {shapes[id]}
    </svg>
  );
}

/** Two pens clashing in a burst of sparks, for Pen Fight's card. */
export function PenFightArt() {
  return (
    <svg className="wp-pen-art" viewBox="0 0 320 170" aria-hidden>
      <rect width="320" height="170" fill="#21252d" />
      <polygon points="0,170 120,60 210,170" fill="#2b3039" />
      <polygon points="320,0 200,96 320,130" fill="#181b21" />
      <g className="wp-art-pen wp-art-pen-a">
        <polygon points="10,132 142,78 150,92 18,146" fill="#ff6a13" />
        <polygon points="10,132 142,78 145,84 13,138" fill="#ffb07f" />
        <polygon points="142,78 164,76 150,92" fill="#f3f6f9" />
        <polygon points="10,132 18,146 6,150 0,138" fill="#7a2c06" />
      </g>
      <g className="wp-art-pen wp-art-pen-b">
        <polygon points="310,132 178,78 170,92 302,146" fill="#3f8cff" />
        <polygon points="310,132 178,78 175,84 307,138" fill="#a9ccff" />
        <polygon points="178,78 156,76 170,92" fill="#f3f6f9" />
        <polygon points="310,132 302,146 314,150 320,138" fill="#123a7a" />
      </g>
      <polygon className="wp-art-spark" points="160,44 168,70 194,62 176,82 196,100 168,94 160,122 152,94 124,100 144,82 126,62 152,70" fill="#fff4dc" />
    </svg>
  );
}

/** What gets drawn on Doodle Rush's card, stroke by stroke, on a 200 × 150 sheet. */
const ROCKET = [
  { d: 'M100 14C122 34 126 66 120 96L80 96C74 66 78 34 100 14Z', color: '#14100c', width: 4 },
  { d: 'M111 54a11 11 0 1 1-22 0a11 11 0 1 1 22 0', color: '#2a6fdb', width: 4 },
  { d: 'M79 74L58 104L82 96', color: '#e0322b', width: 4 },
  { d: 'M121 74L142 104L118 96', color: '#e0322b', width: 4 },
  { d: 'M90 101C86 114 96 118 100 130C104 118 114 114 110 101', color: '#ff6a13', width: 4 },
  { d: 'M36 36L46 46M46 36L36 46', color: '#e84f9c', width: 3 },
  { d: 'M156 54L166 64M166 54L156 64', color: '#3fae3a', width: 3 },
];
const DOODLE_DRAW_S = 6;
const DOODLE_LOOP_S = 9.2;
/** When each guess pops up; the last is the right one. */
const DOODLE_GUESSES_AT = [1.9, 3.9, 6.2];
const DOODLE_WIPE_AT = 8.7;

/** Doodle Rush's card: a sheet tilted on a yellow desk, drawing itself while the guesses come in. */
export function DoodleArt() {
  const rootRef = useRef<HTMLDivElement>(null);
  const penRef = useRef<SVGGElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const root = rootRef.current!;
    const pen = penRef.current!;
    const clock = clockRef.current!;
    const lines = [...root.querySelectorAll<SVGPathElement>('.wp-doodle-line')];
    const lengths = lines.map((l) => l.getTotalLength());
    const total = lengths.reduce((a, b) => a + b, 0);
    lines.forEach((l, i) => l.setAttribute('stroke-dasharray', `${lengths[i]}`));

    const show = (t: number) => {
      let left = Math.min(1, t / DOODLE_DRAW_S) * total;
      let tip: DOMPoint | null = null;
      lines.forEach((l, i) => {
        const drawn = Math.min(lengths[i], left);
        l.setAttribute('stroke-dashoffset', `${lengths[i] - drawn}`);
        if (left > 0 && left <= lengths[i]) tip = l.getPointAtLength(drawn);
        left -= drawn;
      });
      if (tip) pen.setAttribute('transform', `translate(${(tip as DOMPoint).x} ${(tip as DOMPoint).y})`);
      const step = String(DOODLE_GUESSES_AT.filter((at) => t >= at).length);
      if (root.dataset.step !== step) root.dataset.step = step;
      root.classList.toggle('is-done', t >= DOODLE_DRAW_S);
      root.classList.toggle('is-wipe', t >= DOODLE_WIPE_AT);
      const seconds = String(Math.ceil(80 - Math.min(t, DOODLE_GUESSES_AT[2]) * 7));
      if (clock.textContent !== seconds) clock.textContent = seconds;
    };

    if (stageTier() === 'off') {
      show(DOODLE_WIPE_AT - 0.1);
      return;
    }
    show(0);

    /** Where 3D can't run, the flat sheet animates instead. */
    const playFlat = () => {
      let t = 0;
      return whileSeen(root, () => {
        let frame = 0;
        let last = performance.now();
        const loop = (now: number) => {
          t = (t + Math.min(0.05, (now - last) / 1000)) % DOODLE_LOOP_S;
          last = now;
          show(t);
          frame = requestAnimationFrame(loop);
        };
        frame = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frame);
      });
    };

    let stop: (() => void) | undefined;
    let gone = false;
    // The 3D waits until the card is actually seen: a card further along the slider costs nothing yet.
    const notSeen = onceSeen(root, () => {
      import('../drawGame/card3d')
        .then(({ playDoodle3D }) => {
          if (gone) return;
          const strokes = lines.map((path, i) => ({ path, color: ROCKET[i].color, width: ROCKET[i].width }));
          const timing = { draw: DOODLE_DRAW_S, loop: DOODLE_LOOP_S, wipeAt: DOODLE_WIPE_AT, revealAt: DOODLE_GUESSES_AT[2] };
          stop = playDoodle3D(canvasRef.current!, strokes, timing, show);
          root.classList.add('is-3d');
        })
        .catch(() => {
          if (!gone) stop = playFlat();
        });
    });
    return () => {
      gone = true;
      notSeen();
      stop?.();
    };
  }, []);

  return (
    <div ref={rootRef} className="wp-doodle" data-step="0" aria-hidden>
      <canvas ref={canvasRef} className="wp-doodle-3d" />
      <div className="wp-doodle-scene">
        <div className="wp-doodle-sheet">
          <svg viewBox="0 0 200 150">
            <g className="wp-doodle-ink">
              {ROCKET.map((s) => (
                <path key={s.d} className="wp-doodle-line" d={s.d} fill="none" stroke={s.color} strokeWidth={s.width} strokeLinecap="round" strokeLinejoin="round" />
              ))}
            </g>
            <text className="wp-doodle-mask" x="100" y="146" textAnchor="middle">
              _ _ _ _ _ _
            </text>
            <text className="wp-doodle-word" x="100" y="146" textAnchor="middle">
              ROCKET
            </text>
            <g ref={penRef} className="wp-doodle-pen">
              <polygon points="0,0 7,-16 15,-12 5,3" fill="#ff6a13" />
              <polygon points="0,0 3,-7 8,-4 3,1" fill="#f2c9a0" />
              <polygon points="0,0 1.4,-3 3.4,-2 1,0.6" fill="#14100c" />
            </g>
          </svg>
        </div>
        <div className="wp-doodle-paints">
          {['#14100c', '#e0322b', '#ff6a13', '#2a6fdb', '#3fae3a', '#e84f9c'].map((c) => (
            <span key={c} style={{ background: c }} />
          ))}
        </div>
      </div>
      <span ref={clockRef} className="wp-doodle-clock">
        80
      </span>
      <ul className="wp-doodle-guesses">
        <li>A carrot?</li>
        <li>Pencil??</li>
        <li className="is-right">
          Rocket! <b>+320</b>
        </li>
      </ul>
    </div>
  );
}

/** The film strip's frames: little puzzle pictures, and the question they ask. */
const REEL = ['🦁', '?', '💍', '🚂', '?', '🌹', '⚔️', '🔥'];

/** Guess the Movie Title: a strip of film turning in 3D in front of cinema curtains. */
export function MovieArt() {
  return (
    <div className="wp-reel" aria-hidden>
      <span className="wp-reel-beam" />
      <span className="wp-reel-beam is-left" />
      <div className="wp-reel-scene">
        <div className="wp-reel-ring">
          {REEL.map((_, i) => (
            <span key={`b${i}`} className="wp-reel-frame is-back" style={{ '--i': i } as React.CSSProperties} />
          ))}
          {REEL.map((frame, i) => (
            <span key={i} className={`wp-reel-frame${frame === '?' ? ' is-ask' : ''}`} style={{ '--i': i } as React.CSSProperties}>
              {frame}
            </span>
          ))}
        </div>
      </div>
      <p className="wp-reel-tag">#GUESSTHEMOVIE</p>
    </div>
  );
}

/** Stick Man Sword Fight's card: two fighters in 3D, or a flat duel where 3D can't run. */
export function SwordArt() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (stageTier() === 'off') return;
    let stop: (() => void) | undefined;
    let gone = false;
    const notSeen = onceSeen(canvasRef.current!, () => {
      void import('../swordGame/card3d')
        .then(({ playDuelCard }) => {
          if (!gone && canvasRef.current) stop = playDuelCard(canvasRef.current);
        })
        .catch(() => {});
    });
    return () => {
      gone = true;
      notSeen();
      stop?.();
    };
  }, []);
  return <canvas ref={canvasRef} className="wp-pen-art wp-sword-art" aria-hidden />;
}

/** Wolf Run's card: the real game's wolf and course in 3D, or in 2D where 3D can't run. */
export function WolfRunArt() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let stop: (() => void) | undefined;
    let gone = false;
    const flat = (still: boolean) =>
      import('../runnerGame/cardScene').then(({ playCardScene }) => {
        if (!gone && canvasRef.current) stop = playCardScene(canvasRef.current, still);
      });
    const notSeen = onceSeen(canvasRef.current!, () => {
      if (stageTier() === 'off') void flat(true);
      else {
        import('../runnerGame/card3d')
          .then(({ playWolf3D }) => {
            if (!gone && canvasRef.current) stop = playWolf3D(canvasRef.current);
          })
          .catch(() => void flat(false));
      }
    });
    return () => {
      gone = true;
      notSeen();
      stop?.();
    };
  }, []);
  return <canvas ref={canvasRef} className="wp-pen-art wp-wolf-art" aria-hidden />;
}

export function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path d="M4 9.5v5h4l5 4.5V5L8 9.5z" fill="currentColor" />
      {muted ? (
        <path d="m16 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      ) : (
        <path d="M16 8.5a5 5 0 0 1 0 7M18.6 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function FullscreenIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        d={on ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
      <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
