import { animate } from 'motion/mini';
import { m } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackIcon } from '../platform/art';
import { autoFullscreen } from '../platform/fullscreen';
import { buzz, sfx } from '../platform/sfx';
import { stageTier } from '../platform/tier';
import { playPreview } from './card3d';
import { idle, type Input } from './combat';
import type { Hud, SwordScene as Scene } from './scene';
import { CHAPTERS, CHARACTERS, POWERS, SWORDS, characterOf, swordOf, type Chapter, type CharacterId, type PowerId, type SwordId } from './story';
import './swordGame.css';

const SAVE_KEY = 'wildplayers:sword-progress';

interface Save {
  /** The furthest chapter open. */
  open: number;
  character: CharacterId;
  sword: SwordId;
  blood: boolean;
}

function readSave(): Save {
  const fresh: Save = { open: 1, character: 'ronin', sword: 'iron', blood: true };
  try {
    return { ...fresh, ...(JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}') as Partial<Save>) };
  } catch {
    return fresh;
  }
}

function writeSave(save: Save): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Remembering is only a convenience.
  }
}

/** Turns the phone's screen sideways where the browser allows it; the page's CSS rotates it where it doesn't. */
function goLandscape(): void {
  autoFullscreen();
  const orientation = window.screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  // Full screen takes a moment to arrive, and locking needs it.
  window.setTimeout(() => void orientation.lock?.('landscape').catch(() => {}), 250);
}

type Screen = { kind: 'title' } | { kind: 'choose' } | { kind: 'chapters' } | { kind: 'fight'; chapter: Chapter } | { kind: 'done'; chapter: Chapter; won: boolean };

/** Stick Man Sword Fight: a story of eight duels. */
export default function SwordGame({ onExit }: { onExit: () => void }) {
  const [screen, setScreen] = useState<Screen>({ kind: 'title' });
  const [save, setSave] = useState(readSave);

  const update = useCallback((change: Partial<Save>) => {
    setSave((was) => {
      const next = { ...was, ...change };
      writeSave(next);
      return next;
    });
  }, []);

  useEffect(
    () => () => {
      window.screen.orientation?.unlock?.();
    },
    [],
  );

  const leave = () => {
    sfx.back();
    onExit();
  };

  return (
    <div className="wp-root sf-root">
      {screen.kind === 'title' && (
        <Title
          save={save}
          onStart={() => {
            sfx.unlock();
            sfx.launch();
            goLandscape();
            setScreen({ kind: 'choose' });
          }}
          onExit={leave}
        />
      )}
      {screen.kind === 'choose' && <Choose save={save} onChange={update} onDone={() => setScreen({ kind: 'chapters' })} onBack={() => setScreen({ kind: 'title' })} />}
      {screen.kind === 'chapters' && (
        <Chapters
          open={save.open}
          onPick={(chapter) => {
            sfx.launch();
            goLandscape();
            setScreen({ kind: 'fight', chapter });
          }}
          onBack={() => setScreen({ kind: 'choose' })}
        />
      )}
      {screen.kind === 'fight' && (
        <Fight
          key={screen.chapter.id}
          chapter={screen.chapter}
          save={save}
          onQuit={() => setScreen({ kind: 'chapters' })}
          onEnd={(won) => {
            if (won) update({ open: Math.max(save.open, Math.min(CHAPTERS.length, screen.chapter.id + 1)) });
            setScreen({ kind: 'done', chapter: screen.chapter, won });
          }}
        />
      )}
      {screen.kind === 'done' && (
        <Done
          chapter={screen.chapter}
          won={screen.won}
          onAgain={() => setScreen({ kind: 'fight', chapter: screen.chapter })}
          onNext={() => {
            const next = CHAPTERS.find((c) => c.id === screen.chapter.id + 1);
            setScreen(next ? { kind: 'fight', chapter: next } : { kind: 'chapters' });
          }}
          onChapters={() => setScreen({ kind: 'chapters' })}
        />
      )}
    </div>
  );
}

function Top({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <header className="sf-top">
      <button
        type="button"
        className="wp-icon-btn"
        aria-label="Go back"
        title="Go back"
        onClick={() => {
          sfx.back();
          onBack();
        }}
      >
        <BackIcon />
      </button>
      <h1 className="sf-heading">{title}</h1>
      <span className="sf-beta">Beta</span>
    </header>
  );
}

function Title({ save, onStart, onExit }: { save: Save; onStart: () => void; onExit: () => void }) {
  return (
    <main className="sf-title">
      <button type="button" className="wp-icon-btn sf-title-back" aria-label="Leave the game" title="Leave the game" onClick={onExit}>
        <BackIcon />
      </button>
      <p className="sf-kicker">
        A story in eight duels <span className="sf-beta">Beta</span>
      </p>
      <h1 className="sf-logo">Stick Man Sword Fight</h1>
      <p className="sf-lead">They burned your home. Take your master’s sword and follow the road to the Throne of Ash.</p>
      <m.button type="button" className="wp-play sf-start" whileTap={{ scale: 0.95 }} onClick={onStart}>
        {save.open > 1 ? `Continue: chapter ${save.open}` : 'Start the story'}
      </m.button>
    </main>
  );
}

function Choose({ save, onChange, onDone, onBack }: { save: Save; onChange: (c: Partial<Save>) => void; onDone: () => void; onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chosen = useRef(save);
  chosen.current = save;

  useEffect(() => {
    if (stageTier() === 'off') return;
    try {
      return playPreview(canvasRef.current!, () => chosen.current);
    } catch {
      return undefined;
    }
  }, []);

  const hero = characterOf(save.character);
  const blade = swordOf(save.sword);
  return (
    <main className="sf-choose">
      <Top title="Choose your fighter" onBack={onBack} />
      <div className="sf-choose-grid">
        <section aria-label="Fighters" className="sf-list">
          {CHARACTERS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`sf-option${c.id === save.character ? ' is-on' : ''}`}
              aria-pressed={c.id === save.character}
              onClick={() => {
                sfx.tap();
                onChange({ character: c.id });
              }}
            >
              <i style={{ background: c.color }} aria-hidden />
              <strong>{c.name}</strong>
              <small>{c.blurb}</small>
            </button>
          ))}
        </section>
        <div className="sf-preview">
          <canvas ref={canvasRef} aria-label={`${hero.name} with the ${blade.name}`} />
          <p>
            {hero.name} · {blade.name}
          </p>
        </div>
        <section aria-label="Swords" className="sf-list">
          {SWORDS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`sf-option${s.id === save.sword ? ' is-on' : ''}`}
              aria-pressed={s.id === save.sword}
              onClick={() => {
                sfx.tap();
                onChange({ sword: s.id });
              }}
            >
              <i className="is-blade" style={{ background: s.color }} aria-hidden />
              <strong>{s.name}</strong>
              <small>{s.blurb}</small>
            </button>
          ))}
        </section>
      </div>
      <footer className="sf-choose-foot">
        <label className="sf-toggle">
          <input type="checkbox" checked={save.blood} onChange={(e) => onChange({ blood: e.target.checked })} />
          <span>Blood effects</span>
        </label>
        <p className="sf-free">All free to use</p>
        <button
          type="button"
          className="wp-play sf-go"
          onClick={() => {
            sfx.tap();
            onDone();
          }}
        >
          Choose a chapter
        </button>
      </footer>
    </main>
  );
}

function Chapters({ open, onPick, onBack }: { open: number; onPick: (c: Chapter) => void; onBack: () => void }) {
  return (
    <main className="sf-chapters">
      <Top title="The road to the Throne" onBack={onBack} />
      <ol className="sf-road">
        {CHAPTERS.map((c) => {
          const locked = c.id > open;
          return (
            <li key={c.id}>
              <button
                type="button"
                className={`sf-chapter${locked ? ' is-locked' : ''}`}
                aria-disabled={locked}
                onClick={() => {
                  if (locked) sfx.back();
                  else onPick(c);
                }}
              >
                <b>{c.id}</b>
                <strong>{locked ? 'Locked' : c.title}</strong>
                <small>{locked ? `Win chapter ${c.id - 1}` : c.place}</small>
                {!locked && <em>vs {c.foe.name}</em>}
              </button>
            </li>
          );
        })}
      </ol>
    </main>
  );
}

function Bar({ refEl, className }: { refEl: React.RefObject<HTMLElement | null>; className: string }) {
  return (
    <span className={`sf-bar ${className}`}>
      <i ref={refEl as React.RefObject<HTMLElement>} />
    </span>
  );
}

const POWER_GLYPH: Record<PowerId, string> = { wave: 'M4 20C14 18 19 12 20 4C22 13 17 21 4 20Z', dash: 'M3 12h12M11 6l7 6-7 6M3 7h6M3 17h6', heal: 'M12 5v14M5 12h14' };

function Fight({ chapter, save, onQuit, onEnd }: { chapter: Chapter; save: Save; onQuit: () => void; onEnd: (won: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene | null>(null);
  const input = useRef<Input>(idle());
  const hpRef = useRef<HTMLElement>(null);
  const foeRef = useRef<HTMLElement>(null);
  const energyRef = useRef<HTMLElement>(null);
  const guardRef = useRef<HTMLElement>(null);
  const callRef = useRef<HTMLParagraphElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const powerRefs = useRef<Partial<Record<PowerId, HTMLButtonElement | null>>>({});
  const [line, setLine] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const talking = line < chapter.before.length;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;

  const call = useCallback((text: string) => {
    const el = callRef.current;
    if (!el) return;
    el.textContent = text;
    animate(el, { opacity: [0, 1, 1, 0], transform: ['scale(1.7)', 'scale(1)', 'scale(1)', 'scale(0.96)'] }, { duration: 1.1, ease: 'easeOut' });
  }, []);

  useEffect(() => {
    let gone = false;
    const hud = (h: Hud) => {
      hpRef.current?.style.setProperty('transform', `scaleX(${h.hp})`);
      foeRef.current?.style.setProperty('transform', `scaleX(${h.foeHp})`);
      energyRef.current?.style.setProperty('transform', `scaleX(${h.energy / 100})`);
      guardRef.current?.style.setProperty('transform', `scaleX(${h.guard})`);
      for (const p of POWERS) powerRefs.current[p.id]?.classList.toggle('is-ready', h.energy >= p.cost);
    };
    void (async () => {
      try {
        const [{ SwordScene }, { loadPhysics }] = await Promise.all([import('./scene'), import('./world')]);
        await loadPhysics();
        if (gone || !canvasRef.current) return;
        sceneRef.current = new SwordScene(canvasRef.current, {
          chapter,
          character: save.character,
          sword: save.sword,
          blood: save.blood,
          input: input.current,
          low: stageTier() !== 'high',
          onHud: hud,
          onCall: call,
          onEnd: (won) => onEndRef.current(won),
          onAway: () => setPaused(true),
        });
        setLoading(false);
      } catch {
        if (!gone) setFailed(true);
      }
    })();
    return () => {
      gone = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    // One scene per chapter; the choices can't change during it.
  }, [chapter, call]);

  useEffect(() => {
    sceneRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    const el = lineRef.current;
    if (el && talking) animate(el, { opacity: [0, 1], transform: ['translateY(14px)', 'translateY(0)'] }, { duration: 0.24, ease: 'easeOut' });
  }, [line, talking]);

  const advance = () => {
    sfx.tap();
    const next = line + 1;
    setLine(next);
    if (next >= chapter.before.length) {
      sceneRef.current?.begin();
      call('Fight!');
      sfx.launch();
    }
  };

  // Keyboard: arrows or A/D to move, W or up to jump, J to strike, K to guard, 1 to 3 for powers.
  useEffect(() => {
    const keys = new Set<string>();
    const steer = () => {
      input.current.move = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0);
    };
    const map: Record<string, string> = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (map[e.code]) keys.add(map[e.code]);
      steer();
      if (e.code === 'ArrowUp' || e.code === 'KeyW') input.current.jump = true;
      if (e.code === 'KeyJ' || e.code === 'Space') {
        input.current.attack = true;
        e.preventDefault();
      }
      if (e.code === 'KeyK' || e.code === 'ArrowDown') input.current.block = true;
      const power = POWERS[Number(e.key) - 1];
      if (power) input.current.power = power.id;
    };
    const up = (e: KeyboardEvent) => {
      if (map[e.code]) keys.delete(map[e.code]);
      steer();
      if (e.code === 'KeyK' || e.code === 'ArrowDown') input.current.block = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  /** A button you hold. */
  const hold = (on: () => void, off: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      on();
    },
    onPointerUp: off,
    onPointerCancel: off,
    onLostPointerCapture: off,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });
  const press = (on: () => void) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      buzz(6);
      on();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const speaker = chapter.before[Math.min(line, chapter.before.length - 1)];
  const name = speaker.who === 'hero' ? characterOf(save.character).name : speaker.who;

  return (
    <main className="sf-fight">
      <canvas ref={canvasRef} className="sf-canvas" aria-label={`Fight against ${chapter.foe.name}`} />
      {loading && !failed && (
        <div className="wp-loading sf-cover" role="status">
          <span className="wp-loader" aria-hidden />
          Entering {chapter.title}…
        </div>
      )}
      {failed && (
        <div className="wp-loading sf-cover" role="alert">
          <p>This fight couldn’t start on this device.</p>
          <button type="button" className="wp-play" onClick={onQuit}>
            Back to the chapters
          </button>
        </div>
      )}

      {!talking && (
        <>
          <div className="sf-hud">
            <div className="sf-side">
              <strong>{characterOf(save.character).name}</strong>
              <Bar refEl={hpRef} className="is-hp" />
              <Bar refEl={guardRef} className="is-guard" />
            </div>
            <button type="button" className="sf-pause" aria-label="Pause" title="Pause" onClick={() => setPaused(true)}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
              </svg>
            </button>
            <div className="sf-side is-foe">
              <strong>{chapter.foe.name}</strong>
              <Bar refEl={foeRef} className="is-foe-hp" />
            </div>
          </div>
          <div className="sf-pad">
            <button type="button" className="sf-key" aria-label="Move left" {...hold(() => (input.current.move = -1), () => (input.current.move = input.current.move < 0 ? 0 : input.current.move))}>
              <BackIcon />
            </button>
            <button type="button" className="sf-key is-flip" aria-label="Move right" {...hold(() => (input.current.move = 1), () => (input.current.move = input.current.move > 0 ? 0 : input.current.move))}>
              <BackIcon />
            </button>
          </div>
          <div className="sf-actions">
            <div className="sf-powers">
              <span className="sf-energy">
                <Bar refEl={energyRef} className="is-energy" />
              </span>
              {POWERS.map((p) => (
                <button
                  key={p.id}
                  ref={(el) => {
                    powerRefs.current[p.id] = el;
                  }}
                  type="button"
                  className="sf-power"
                  aria-label={`${p.name}, costs ${p.cost} energy`}
                  title={p.name}
                  {...press(() => (input.current.power = p.id))}
                >
                  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                    <path d={POWER_GLYPH[p.id]} fill={p.id === 'wave' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ))}
            </div>
            <button type="button" className="sf-key is-jump" {...press(() => (input.current.jump = true))}>
              Jump
            </button>
            <button type="button" className="sf-key is-guard" {...hold(() => (input.current.block = true), () => (input.current.block = false))}>
              Guard
            </button>
            <button type="button" className="sf-key is-strike" {...press(() => (input.current.attack = true))}>
              Strike
            </button>
          </div>
        </>
      )}

      <p ref={callRef} className="sf-call" aria-live="assertive" />

      {talking && !loading && !failed && (
        <button type="button" className="sf-story" onClick={advance}>
          <span className="sf-chapter-tag">
            Chapter {chapter.id}: {chapter.title}
          </span>
          <div ref={lineRef} className="sf-line">
            <strong>{name}</strong>
            <p>{speaker.line}</p>
          </div>
          <small>Tap to continue</small>
        </button>
      )}

      {paused && (
        <div className="sf-paused">
          <h2 className="sf-heading">Paused</h2>
          <button type="button" className="wp-play" autoFocus onClick={() => setPaused(false)}>
            Keep fighting
          </button>
          <button type="button" className="sf-plain" onClick={onQuit}>
            Leave the fight
          </button>
        </div>
      )}
    </main>
  );
}

function Done({ chapter, won, onAgain, onNext, onChapters }: { chapter: Chapter; won: boolean; onAgain: () => void; onNext: () => void; onChapters: () => void }) {
  const finale = won && chapter.id === CHAPTERS.length;
  const next = CHAPTERS.find((c) => c.id === chapter.id + 1);
  return (
    <main className="sf-done">
      <p className="sf-kicker">
        Chapter {chapter.id}: {chapter.title}
      </p>
      <h1 className="sf-logo">{finale ? 'The End' : won ? 'Victory' : 'You fell'}</h1>
      <p className="sf-lead">{won ? chapter.after : `${chapter.foe.name} stands over you. But the road isn’t finished with you yet.`}</p>
      {finale && <p className="sf-kicker">Thanks for playing the beta.</p>}
      <div className="sf-done-actions">
        {won && next ? (
          <button type="button" className="wp-play" autoFocus onClick={onNext}>
            Chapter {next.id}: {next.title}
          </button>
        ) : (
          !won && (
            <button type="button" className="wp-play" autoFocus onClick={onAgain}>
              Fight again
            </button>
          )
        )}
        <button type="button" className="sf-plain" onClick={onChapters}>
          All chapters
        </button>
      </div>
    </main>
  );
}
