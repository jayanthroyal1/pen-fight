import { animate } from 'motion/mini';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackIcon } from '../platform/art';
import { goLandscape, leaveLandscape } from '../platform/landscape';
import { buzz, sfx } from '../platform/sfx';
import { stageTier } from '../platform/tier';
import '../swordGame/swordGame.css';
import { unturn } from './camera';
import { DODGE_COST, SPECIAL_COST } from './combat';
import { BASE_SIZE, CONTROL_IDS, CONTROL_NAMES, MAX_SCALE, MIN_SCALE, defaultLayout, moveControl, readLayout, resizeAll, resizeControl, saveLayout, setOpacity, type ControlId, type ControlLayout } from './controls';
import { CHAPTERS, HEROES, type Chapter, type Hero } from './roster';
import type { FightStage, Hud, PlayerInput, Quality } from './stage';
import './bladeGame.css';

const SAVE_KEY = 'wildplayers:blade-progress';

interface Save {
  open: number;
  hero: string;
  blood: boolean;
}

function readSave(): Save {
  const fresh: Save = { open: 1, hero: HEROES[0].id, blood: false };
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

function qualityFor(): Quality {
  const tier = stageTier();
  if (tier === 'high') return 'high';
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  return tier === 'low' && memory >= 6 ? 'medium' : 'low';
}

type Screen = { kind: 'title' } | { kind: 'choose' } | { kind: 'chapters' } | { kind: 'fight'; chapter: Chapter } | { kind: 'done'; chapter: Chapter; won: boolean };

/** The anime sword fight, in progress. Reached only by its own link until it replaces the stick man game. */
export default function BladeGame({ onExit }: { onExit: () => void }) {
  const [screen, setScreen] = useState<Screen>({ kind: 'title' });
  const [save, setSave] = useState(readSave);
  const [editingControls, setEditingControls] = useState(false);
  const hero = HEROES.find((h) => h.id === save.hero) ?? HEROES[0];

  const update = useCallback((change: Partial<Save>) => {
    setSave((was) => {
      const next = { ...was, ...change };
      writeSave(next);
      return next;
    });
  }, []);

  useEffect(() => leaveLandscape, []);

  return (
    <div className="wp-root sf-root">
      {screen.kind === 'title' && (
        <main className="sf-title bg-title">
          <button
            type="button"
            className="wp-icon-btn sf-title-back"
            aria-label="Leave the game"
            title="Leave the game"
            onClick={() => {
              sfx.back();
              onExit();
            }}
          >
            <BackIcon />
          </button>
          <p className="sf-kicker">
            Three warlords. One blade. <span className="sf-beta">Preview</span>
          </p>
          <h1 className="sf-logo">Blade of the Rift</h1>
          <p className="sf-lead">Fight through Zarok, Ryujin and Kaelis in a story of six duels.</p>
          <button
            type="button"
            className="wp-play sf-start"
            onClick={() => {
              sfx.unlock();
              sfx.launch();
              goLandscape();
              setScreen({ kind: 'choose' });
            }}
          >
            {save.open > 1 ? `Continue: chapter ${save.open}` : 'Start the story'}
          </button>
        </main>
      )}

      {screen.kind === 'choose' && (
        <main className="sf-choose">
          <header className="sf-top">
            <button type="button" className="wp-icon-btn" aria-label="Go back" title="Go back" onClick={() => setScreen({ kind: 'title' })}>
              <BackIcon />
            </button>
            <h1 className="sf-heading">Choose your hero</h1>
            <span className="sf-beta">Preview</span>
          </header>
          <section className="bg-heroes" aria-label="Heroes">
            {HEROES.map((h) => (
              <button
                key={h.id}
                type="button"
                className={`sf-option bg-hero${h.id === hero.id ? ' is-on' : ''}`}
                aria-pressed={h.id === hero.id}
                onClick={() => {
                  sfx.tap();
                  update({ hero: h.id });
                }}
              >
                <i style={{ background: h.color }} aria-hidden />
                <strong>{h.name}</strong>
                <small>{h.title}</small>
                <em>{h.blurb}</em>
                <em>Special: {h.specialName}</em>
              </button>
            ))}
          </section>
          <footer className="sf-choose-foot">
            <label className="sf-toggle">
              <input type="checkbox" checked={save.blood} onChange={(e) => update({ blood: e.target.checked })} />
              <span>Blood effects</span>
            </label>
            <button type="button" className="sf-plain" onClick={() => setEditingControls(true)}>
              Customize controls
            </button>
            <button type="button" className="wp-play sf-go" onClick={() => setScreen({ kind: 'chapters' })}>
              Choose a chapter
            </button>
          </footer>
        </main>
      )}

      {editingControls && <ControlsEditor start={readLayout()} onDone={() => setEditingControls(false)} />}

      {screen.kind === 'chapters' && (
        <main className="sf-chapters">
          <header className="sf-top">
            <button type="button" className="wp-icon-btn" aria-label="Go back" title="Go back" onClick={() => setScreen({ kind: 'choose' })}>
              <BackIcon />
            </button>
            <h1 className="sf-heading">The three warlords</h1>
            <span className="sf-beta">Preview</span>
          </header>
          <ol className="sf-road bg-road">
            {CHAPTERS.map((c) => {
              const locked = c.id > save.open;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`sf-chapter${locked ? ' is-locked' : ''}`}
                    aria-disabled={locked}
                    onClick={() => {
                      if (locked) {
                        sfx.back();
                        return;
                      }
                      sfx.launch();
                      goLandscape();
                      setScreen({ kind: 'fight', chapter: c });
                    }}
                  >
                    <b>{c.id}</b>
                    <strong>{locked ? 'Locked' : c.title}</strong>
                    <small>{locked ? `Win chapter ${c.id - 1}` : c.act}</small>
                    {!locked && <em>vs {c.foe.name}</em>}
                  </button>
                </li>
              );
            })}
          </ol>
        </main>
      )}

      {screen.kind === 'fight' && (
        <Fight
          key={screen.chapter.id}
          chapter={screen.chapter}
          hero={hero}
          blood={save.blood}
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

function Done({ chapter, won, onAgain, onNext, onChapters }: { chapter: Chapter; won: boolean; onAgain: () => void; onNext: () => void; onChapters: () => void }) {
  const next = CHAPTERS.find((c) => c.id === chapter.id + 1);
  const finale = won && !next;
  return (
    <main className="sf-done bg-title">
      <p className="sf-kicker">
        Chapter {chapter.id}: {chapter.title}
      </p>
      <h1 className="sf-logo">{finale ? 'The End' : won ? 'Victory' : 'Defeated'}</h1>
      <p className="sf-lead">{won ? chapter.after : `${chapter.foe.name} is still standing. Find the opening and try again.`}</p>
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

const isTurned = () => window.matchMedia('(orientation: portrait) and (pointer: coarse)').matches;

/** Where a control goes, from the player's layout. */
function placed(layout: ControlLayout, id: ControlId): React.CSSProperties {
  const p = layout.places[id];
  const size = BASE_SIZE[id] * p.scale;
  return { left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: size, height: size, opacity: layout.opacity };
}

type ActionId = Exclude<ControlId, 'stick'>;

const ICONS: Record<ActionId, string> = {
  light: 'M19.5 3.5 21 5l-9.5 9.5 1.8 1.8-1.4 1.4-1.9-1.9-3.7 3.7-2.1-2.1 3.7-3.7-1.9-1.9 1.4-1.4 1.8 1.8z',
  heavy: 'M4 3l5.6 2.2 8.9 8.9 1.6-1.6 1.4 1.4-2.3 2.3 1.4 1.4-2.8 2.8-1.4-1.4-2.3 2.3-1.4-1.4 1.6-1.6-8.9-8.9z',
  guard: 'M12 2l8 3v6.2c0 5-3.4 8.8-8 10.8-4.6-2-8-5.8-8-10.8V5z',
  dodge: 'M13 3l8 9-8 9v-5.2L18 12l-5-3.8zM4 7h6v2H4zm-2 4h8v2H2zm2 4h6v2H4z',
  special: 'M12 1.5l2.9 6.6 7.1.7-5.4 4.7 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 8.8l7.1-.7z',
};

/** What's on a button: its ring, icon and name. */
function ActionFace({ id, children }: { id: ActionId; children?: React.ReactNode }) {
  return (
    <>
      <span className="bg-ring" aria-hidden />
      <span className="bg-face" aria-hidden>
        <svg viewBox="0 0 24 24">
          <path d={ICONS[id]} fill="currentColor" />
        </svg>
        <small>{CONTROL_NAMES[id]}</small>
      </span>
      {children}
    </>
  );
}

function StickFace({ knobRef, dirRef }: { knobRef?: React.Ref<HTMLSpanElement>; dirRef?: React.Ref<HTMLSpanElement> }) {
  return (
    <>
      <span ref={dirRef} className="bg-stick-dir" aria-hidden />
      <span className="bg-stick-mark is-up" aria-hidden />
      <span className="bg-stick-mark is-right" aria-hidden />
      <span className="bg-stick-mark is-down" aria-hidden />
      <span className="bg-stick-mark is-left" aria-hidden />
      <span ref={knobRef} className="bg-stick-knob" />
    </>
  );
}

/** The joystick: a thumb can start anywhere on it and slide beyond its edge. */
function Stick({ input, layout }: { input: React.MutableRefObject<PlayerInput>; layout: ControlLayout }) {
  const knobRef = useRef<HTMLSpanElement>(null);
  const dirRef = useRef<HTMLSpanElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const range = (BASE_SIZE.stick * layout.places.stick.scale) * 0.32;

  const release = () => {
    start.current = null;
    input.current.stickX = 0;
    input.current.stickY = 0;
    if (knobRef.current) knobRef.current.style.transform = '';
    if (dirRef.current) dirRef.current.style.opacity = '0';
    baseRef.current?.classList.remove('is-down');
  };

  return (
    <div
      ref={baseRef}
      className="bg-ctl bg-stick"
      style={placed(layout, 'stick')}
      role="presentation"
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        baseRef.current?.classList.add('is-down');
      }}
      onPointerMove={(e) => {
        const s = start.current;
        if (!s || s.id !== e.pointerId) return;
        const { x, y } = unturn(e.clientX - s.x, e.clientY - s.y, isTurned());
        const length = Math.hypot(x, y) || 1;
        const k = Math.min(1, length / range) / length;
        input.current.stickX = x * k;
        input.current.stickY = -y * k;
        if (knobRef.current) knobRef.current.style.transform = `translate(calc(-50% + ${x * k * range}px), calc(-50% + ${y * k * range}px))`;
        if (dirRef.current) {
          dirRef.current.style.opacity = String(Math.min(1, length / range));
          dirRef.current.style.transform = `rotate(${Math.atan2(x, -y)}rad)`;
        }
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <StickFace knobRef={knobRef} dirRef={dirRef} />
    </div>
  );
}

/** Drag anything to move it, and use the sliders to size it. Saved on this device. */
function ControlsEditor({ start, onDone }: { start: ControlLayout; onDone: (layout: ControlLayout) => void }) {
  const [layout, setLayout] = useState(start);
  const [picked, setPicked] = useState<ControlId>('stick');
  const size = layout.places[picked].scale;
  const nudge = (by: number) => setLayout((l) => resizeControl(l, picked, Math.round((l.places[picked].scale + by) * 100) / 100));
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: ControlId; x: number; y: number; px: number; py: number } | null>(null);

  return (
    <div ref={boxRef} className="bg-editor">
      <p className="bg-editor-hint">Drag to move. Tap a control, then set its size.</p>
      {CONTROL_IDS.map((id) => (
        <button
          key={id}
          type="button"
          className={`bg-ctl bg-edit-item${id === 'stick' ? ' bg-stick' : ` bg-action is-${id} is-ready`}${id === picked ? ' is-picked' : ''}`}
          style={{ ...placed(layout, id), opacity: 1 }}
          aria-label={`Move ${CONTROL_NAMES[id]}`}
          onPointerDown={(e) => {
            e.preventDefault();
            e.currentTarget.setPointerCapture(e.pointerId);
            setPicked(id);
            const p = layout.places[id];
            drag.current = { id, x: e.clientX, y: e.clientY, px: p.x, py: p.y };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            const box = boxRef.current;
            if (!d || !box) return;
            const { x, y } = unturn(e.clientX - d.x, e.clientY - d.y, isTurned());
            const w = box.clientWidth;
            const h = box.clientHeight;
            setLayout((l) => moveControl(l, d.id, d.px + x / w, d.py + y / h, w, h));
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          {id === 'stick' ? <StickFace /> : <ActionFace id={id} />}
        </button>
      ))}
      <div className="bg-editor-bar">
        <div className="bg-size">
          <span>
            {CONTROL_NAMES[picked]} size: {Math.round(size * 100)}%
          </span>
          <div>
            <button type="button" aria-label={`Make ${CONTROL_NAMES[picked]} smaller`} onClick={() => nudge(-0.05)}>
              −
            </button>
            <input type="range" aria-label={`${CONTROL_NAMES[picked]} size`} min={MIN_SCALE} max={MAX_SCALE} step={0.05} value={size} onChange={(e) => setLayout((l) => resizeControl(l, picked, Number(e.target.value)))} />
            <button type="button" aria-label={`Make ${CONTROL_NAMES[picked]} bigger`} onClick={() => nudge(0.05)}>
              +
            </button>
          </div>
        </div>
        <label>
          <span>All controls</span>
          <input type="range" min={MIN_SCALE} max={MAX_SCALE} step={0.05} defaultValue={1} onChange={(e) => setLayout((l) => resizeAll(l, Number(e.target.value)))} />
        </label>
        <label>
          <span>Opacity</span>
          <input type="range" min={0.2} max={1} step={0.05} value={layout.opacity} onChange={(e) => setLayout((l) => setOpacity(l, Number(e.target.value)))} />
        </label>
        <button type="button" className="sf-plain" onClick={() => setLayout(defaultLayout())}>
          Reset
        </button>
        <button
          type="button"
          className="wp-play bg-editor-done"
          onClick={() => {
            sfx.tap();
            saveLayout(layout);
            onDone(layout);
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

function Fight({ chapter, hero, blood, onQuit, onEnd }: { chapter: Chapter; hero: Hero; blood: boolean; onQuit: () => void; onEnd: (won: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<FightStage | null>(null);
  const input = useRef<PlayerInput>({ stickX: 0, stickY: 0, guard: false, light: false, heavy: false, dodge: false, special: false });
  const hpRef = useRef<HTMLElement>(null);
  const foeRef = useRef<HTMLElement>(null);
  const staminaRef = useRef<HTMLElement>(null);
  const guardRef = useRef<HTMLElement>(null);
  const energyRef = useRef<HTMLElement>(null);
  const buttons = useRef<Partial<Record<ActionId, HTMLButtonElement | null>>>({});
  const shownLanded = useRef(0);
  const callRef = useRef<HTMLParagraphElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [layout, setLayout] = useState(readLayout);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
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
    const bar = (ref: React.RefObject<HTMLElement | null>, v: number) => ref.current?.style.setProperty('transform', `scaleX(${v})`);
    const onHud = (h: Hud) => {
      bar(hpRef, h.hp);
      bar(foeRef, h.foeHp);
      bar(staminaRef, h.stamina);
      bar(guardRef, h.guard);
      bar(energyRef, h.energy);
      const b = buttons.current;
      // Each ring fills towards what the move costs, and the button lights when it's ready.
      const charge = (id: ActionId, have: number, need: number) => {
        const el = b[id];
        el?.style.setProperty('--fill', String(Math.min(1, have / need)));
        el?.classList.toggle('is-ready', have >= need);
      };
      charge('special', h.energy * 100, SPECIAL_COST);
      charge('dodge', h.stamina * 100, DODGE_COST);
      charge('heavy', h.stamina * 100, hero.moves[3].staminaCost);
      charge('guard', h.guard, 0.01);
      b.guard?.style.setProperty('--fill', String(h.guard));
      b.guard?.classList.toggle('is-on', h.guarding);
      if (b.light) b.light.dataset.combo = String(h.combo);
      controlsRef.current?.classList.toggle('is-stunned', h.stunned);
      if (h.landed !== shownLanded.current) {
        shownLanded.current = h.landed;
        const light = b.light;
        light?.classList.remove('is-hit');
        void light?.offsetWidth;
        light?.classList.add('is-hit');
      }
    };
    void (async () => {
      try {
        const { FightStage } = await import('./stage');
        if (gone || !canvasRef.current) return;
        const stage = await FightStage.create({
          canvas: canvasRef.current,
          hero,
          chapter,
          blood,
          quality: qualityFor(),
          input: input.current,
          onHud,
          onCall: call,
          onEnd: (won) => onEndRef.current(won),
          onAway: () => setPaused(true),
        });
        if (gone) {
          stage.dispose();
          return;
        }
        stageRef.current = stage;
        setLoading(false);
      } catch (e) {
        console.error(e);
        if (!gone) setFailed(true);
      }
    })();
    return () => {
      gone = true;
      stageRef.current?.dispose();
      stageRef.current = null;
    };
    // One stage per chapter; the choices can't change during it.
  }, [chapter, call]);

  useEffect(() => {
    stageRef.current?.setPaused(paused);
  }, [paused]);

  useEffect(() => {
    const el = lineRef.current;
    if (el && talking) animate(el, { opacity: [0, 1], transform: ['translateY(14px)', 'translateY(0)'] }, { duration: 0.24, ease: 'easeOut' });
  }, [line, talking]);

  const advanceStory = () => {
    sfx.tap();
    const next = line + 1;
    setLine(next);
    if (next >= chapter.before.length) {
      stageRef.current?.begin();
      call('Fight!');
      sfx.launch();
    }
  };

  // Keyboard: WASD or arrows to move, J light, K heavy, L guard, Space dodge, I special.
  useEffect(() => {
    const keys = new Set<string>();
    const steer = () => {
      const i = input.current;
      i.stickX = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      i.stickY = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    };
    const down = (e: KeyboardEvent) => {
      if (e.repeat) return;
      keys.add(e.code);
      steer();
      const i = input.current;
      if (e.code === 'KeyJ') i.light = true;
      if (e.code === 'KeyK') i.heavy = true;
      if (e.code === 'KeyL') i.guard = true;
      if (e.code === 'Space') {
        i.dodge = true;
        e.preventDefault();
      }
      if (e.code === 'KeyI') i.special = true;
    };
    const up = (e: KeyboardEvent) => {
      keys.delete(e.code);
      steer();
      if (e.code === 'KeyL') input.current.guard = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  /** A button: presses in under the thumb, and sets its input. */
  const action = (id: ActionId, label: string) => {
    const up = (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.classList.remove('is-down');
      if (id === 'guard') input.current.guard = false;
    };
    return {
      type: 'button' as const,
      ref: (el: HTMLButtonElement | null) => {
        buttons.current[id] = el;
      },
      className: `bg-ctl bg-action is-${id}`,
      style: placed(layout, id),
      'aria-label': label,
      onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.classList.add('is-down');
        buzz(8);
        if (id === 'guard') input.current.guard = true;
        else input.current[id] = true;
      },
      onPointerUp: up,
      onPointerCancel: up,
      onLostPointerCapture: up,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    };
  };

  const speaker = chapter.before[Math.min(line, chapter.before.length - 1)];
  const name = speaker.who === 'hero' ? hero.name : speaker.who;

  return (
    <main className="sf-fight">
      <canvas ref={canvasRef} className="sf-canvas" aria-label={`Fight against ${chapter.foe.name}`} />
      {loading && !failed && (
        <div className="wp-loading sf-cover" role="status">
          <span className="wp-loader" aria-hidden />
          Entering {chapter.place}…
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
              <strong>{hero.name}</strong>
              <span className="sf-bar is-hp">
                <i ref={hpRef as React.RefObject<HTMLElement>} />
              </span>
              <span className="sf-bar is-guard">
                <i ref={guardRef as React.RefObject<HTMLElement>} />
              </span>
              <span className="sf-bar bg-stamina">
                <i ref={staminaRef as React.RefObject<HTMLElement>} />
              </span>
              <span className="sf-bar is-energy bg-energy">
                <i ref={energyRef as React.RefObject<HTMLElement>} />
              </span>
            </div>
            <button type="button" className="sf-pause" aria-label="Pause" title="Pause" onClick={() => setPaused(true)}>
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                <path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor" />
              </svg>
            </button>
            <div className="sf-side is-foe">
              <strong>{chapter.foe.name}</strong>
              <span className="sf-bar is-foe-hp">
                <i ref={foeRef as React.RefObject<HTMLElement>} />
              </span>
            </div>
          </div>

          <div ref={controlsRef} className="bg-controls">
            <Stick input={input} layout={layout} />
            <button {...action('special', `${hero.specialName}, your special`)}>
              <ActionFace id="special" />
            </button>
            <button {...action('dodge', 'Dodge')}>
              <ActionFace id="dodge" />
            </button>
            <button {...action('guard', 'Guard, tap to parry')}>
              <ActionFace id="guard" />
            </button>
            <button {...action('heavy', 'Heavy attack')}>
              <ActionFace id="heavy" />
            </button>
            <button {...action('light', 'Light attack')}>
              <ActionFace id="light">
                <span className="bg-pips" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
              </ActionFace>
            </button>
          </div>
        </>
      )}

      <p ref={callRef} className="sf-call" aria-live="assertive" />

      {talking && !loading && !failed && (
        <button type="button" className="sf-story" onClick={advanceStory}>
          <span className="sf-chapter-tag">
            {chapter.act} · {chapter.title}
          </span>
          <div ref={lineRef} className="sf-line">
            <strong>{name}</strong>
            <p>{speaker.line}</p>
          </div>
          <small>Tap to continue</small>
        </button>
      )}

      {paused && !editing && (
        <div className="sf-paused">
          <h2 className="sf-heading">Paused</h2>
          <button type="button" className="wp-play" autoFocus onClick={() => setPaused(false)}>
            Keep fighting
          </button>
          <button type="button" className="sf-plain" onClick={() => setEditing(true)}>
            Customize controls
          </button>
          <button type="button" className="sf-plain" onClick={onQuit}>
            Leave the fight
          </button>
        </div>
      )}

      {editing && (
        <ControlsEditor
          start={layout}
          onDone={(next) => {
            setLayout(next);
            setEditing(false);
          }}
        />
      )}
    </main>
  );
}
