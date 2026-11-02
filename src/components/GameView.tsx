import { useCallback, useEffect, useRef, useState } from 'react';
import { sounds } from '../audio/sounds';
import { chooseAiShot } from '../game/ai';
import {
  MIN_PULL_PX,
  easeFlick,
  flickFromPull,
  pullPixels,
  pullPower,
  type Drag,
} from '../game/aiming';
import { MAX_IMPULSE, pointOnPen } from '../game/physics';
import { penModel, type PenModelId } from '../game/pens';
import { PLAYER_COLORS } from '../game/players';
import { WIN_SCORE, newMatch, nextRound, resolveShot } from '../game/rules';
import { DeskScene, type Aim } from '../game/scene3d';
import type { Flick, GameState, PlayerId } from '../game/types';
import { DT, DeskWorld, type Impact } from '../game/world';
import type { OnlineClient } from '../net/client';
import { MatchRecorder } from '../recording/recorder';
import { getMatchStore } from '../recording/store';

export type Mode = 'local' | 'ai' | 'online';

interface Props {
  mode: Mode;
  models: [PenModelId, PenModelId];
  online?: { client: OnlineClient; me: PlayerId };
  onExit: () => void;
}

const AI_DELAY_MS = 700;
/** How quickly the shown aim catches up with the pointer (per second). */
const AIM_EASE = 30;

/** A full-power pull, in CSS px: about a third of the desk view. */
const maxPull = (canvas: HTMLCanvasElement) =>
  Math.max(90, 0.32 * Math.min(canvas.clientWidth, canvas.clientHeight));

/** How close (CSS px) a press must be to the pen to grab it; wider for a fingertip. */
const grabRadius = (e: React.PointerEvent) => (e.pointerType === 'touch' ? 34 : 20);

/** A short vibration on phones that support it. */
const buzz = (ms: number) => {
  try {
    navigator.vibrate?.(Math.round(ms));
  } catch {
    // Some browsers block vibration until the page has been interacted with.
  }
};

/** Slide speed (desk px/s) at which the scrape sound is loudest. */
const LOUD_SLIDE = 900;

function playerNames(mode: Mode, me: PlayerId): [string, string] {
  if (mode === 'local') return ['Player 1', 'Player 2'];
  if (mode === 'ai') return ['You', 'Computer'];
  return me === 0 ? ['You', 'Opponent'] : ['Opponent', 'You'];
}

const wins = (name: string) => (name === 'You' ? 'win' : 'wins');
const isMetal = (m: PenModelId) => penModel(m).look.metal;

export function GameView({ mode, models, online, onExit }: Props) {
  const me: PlayerId = online?.me ?? 0;
  const names = playerNames(mode, me);
  const isHuman = useCallback((p: PlayerId) => mode === 'local' || p === me, [mode, me]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(newMatch(models));
  const [hud, setHud] = useState<GameState>(stateRef.current);
  const shooterRef = useRef<PlayerId>(0);
  const dragRef = useRef<Drag | null>(null);
  const shownFlickRef = useRef<Flick | null>(null);
  const hoverRef = useRef(false);
  // Online: the side that did not shoot waits for the shooter's settled state.
  const waitingSyncRef = useRef(false);
  const [peerLeft, setPeerLeft] = useState(false);
  const [muted, setMuted] = useState(sounds.muted);
  // The Rapier world and the three.js view; created with the canvas loop below.
  const worldRef = useRef<DeskWorld | null>(null);
  const sceneRef = useRef<DeskScene | null>(null);
  const recorderRef = useRef<MatchRecorder | null>(null);

  const startRecording = useCallback(() => {
    const [n0, n1] = playerNames(mode, me);
    recorderRef.current = new MatchRecorder(getMatchStore(), {
      mode,
      players: [
        { name: n0, model: models[0] },
        { name: n1, model: models[1] },
      ],
      me: mode === 'local' ? null : me,
    });
  }, [mode, me, models]);
  if (!recorderRef.current) startRecording();

  const commit = useCallback((s: GameState) => {
    const before = stateRef.current.phase;
    stateRef.current = s;
    setHud(s);
    // The class claps for whoever just won the round, and cheers the match winner.
    const won = s.phase === 'matchOver' ? 'match' : s.phase === 'roundOver' ? 'round' : null;
    if (won && before !== s.phase) sounds.applause(won);
    // Any state at rest (a new round, the shooter's synced result) is placed exactly.
    if (s.phase !== 'moving') worldRef.current?.load(s.pens);
  }, []);

  /** A shot is over: record how it ended. */
  const finishShot = useCallback((s: GameState) => {
    void recorderRef.current?.endShot(s);
  }, []);

  const shoot = useCallback(
    (flick: Flick, broadcast: boolean) => {
      const s = stateRef.current;
      const world = worldRef.current;
      if (s.phase !== 'aim' || !world) return;
      world.load(s.pens);
      world.flick(s.turn, flick);
      shooterRef.current = s.turn;
      recorderRef.current?.beginShot(s, flick);
      sounds.flick(Math.min(1, Math.hypot(flick.ix, flick.iy) / MAX_IMPULSE));
      sceneRef.current?.playFlick({ pen: s.pens[s.turn], flick });
      commit({ ...s, phase: 'moving' });
      if (broadcast && online) void online.client.send({ t: 'shot', flick });
    },
    [commit, online],
  );

  const onSettledRef = useRef<() => void>(() => {});
  onSettledRef.current = () => {
    const s = stateRef.current;
    const shooter = shooterRef.current;
    if (mode === 'online' && shooter !== me) {
      waitingSyncRef.current = true;
      return;
    }
    const resolved = resolveShot(s, shooter);
    commit(resolved);
    finishShot(resolved);
    if (online) void online.client.send({ t: 'sync', state: resolved });
  };

  const advance = useCallback(
    (broadcast: boolean) => {
      const s = stateRef.current;
      if (s.phase === 'roundOver') commit(nextRound(s));
      else if (s.phase === 'matchOver') {
        startRecording();
        commit(newMatch(s.models));
      } else return;
      if (broadcast && online) void online.client.send({ t: 'next' });
    },
    [commit, online, startRecording],
  );

  // Physics, sound and the 3D view, every animation frame.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const world = new DeskWorld(stateRef.current.pens, true);
    const scene = new DeskScene(canvas);
    scene.setModels(stateRef.current.models);
    // Handle for poking at the scene from the browser console while developing.
    if (import.meta.env.DEV) Object.assign(window, { __penfight: { scene, state: stateRef, sounds } });
    worldRef.current = world;
    sceneRef.current = scene;
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const observer = new ResizeObserver(() => scene.resize(canvas.clientWidth, canvas.clientHeight));
    observer.observe(canvas);
    scene.resize(canvas.clientWidth, canvas.clientHeight);

    const playImpacts = (impacts: Impact[], s: GameState) => {
      for (const i of impacts) {
        if (i.kind === 'pens') {
          sounds.penHit(i.strength, isMetal(s.models[0]) || isMetal(s.models[1]));
          scene.bump(i.strength);
          buzz(10 + i.strength * 25);
        } else if (i.kind === 'desk') sounds.deskTap(i.strength);
        else sounds.fall(isMetal(s.models[i.pen]));
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = stateRef.current;
      if (s.phase === 'moving' && !waitingSyncRef.current) {
        acc += dt;
        while (acc >= DT && !world.isSettled()) {
          world.step();
          const impacts = world.drainImpacts();
          playImpacts(impacts, s);
          recorderRef.current?.step(world.read(), impacts, DT * 1000);
          acc -= DT;
        }
        s.pens = world.read();
        const [a, b] = world.slideSpeeds();
        sounds.slide(Math.max(a, b) / LOUD_SLIDE);
        if (world.isSettled()) onSettledRef.current();
      } else {
        acc = 0;
        sounds.slide(0);
      }

      const cur = stateRef.current;
      const drag = dragRef.current;
      const pen = cur.pens[cur.turn];
      let aim: Aim | null = null;
      if (drag) {
        // The shown aim eases after the pointer, so it glides instead of jittering.
        const target = flickFromPull(drag, maxPull(canvas));
        const shown = shownFlickRef.current
          ? easeFlick(shownFlickRef.current, target, 1 - Math.exp(-dt * AIM_EASE))
          : target;
        shownFlickRef.current = shown;
        // Only the direction is shown; the dashes turn red at a full stretch.
        const full = pullPower(drag, maxPull(canvas)) >= 1;
        aim = { pen, flick: shown, pointer: drag.currentDesk, full };
      } else {
        shownFlickRef.current = null;
      }
      scene.setModels(cur.models);
      scene.render(cur.pens, aim, cur.phase === 'aim' ? cur.turn : null, now / 1000, hoverRef.current);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      sounds.slide(0);
      sounds.stopApplause();
      worldRef.current = null;
      sceneRef.current = null;
      world.free();
      scene.dispose();
    };
  }, []);

  // Computer's turn.
  useEffect(() => {
    if (mode !== 'ai' || hud.phase !== 'aim' || hud.turn !== 1) return;
    const id = window.setTimeout(() => shoot(chooseAiShot(stateRef.current, 1), false), AI_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [mode, hud.phase, hud.turn, shoot]);

  // Opponent's moves arriving from the relay.
  useEffect(() => {
    if (!online) return;
    return online.client.subscribe((msg) => {
      if (msg.t === 'shot') shoot(msg.flick, false);
      else if (msg.t === 'next') advance(false);
      else if (msg.t === 'peer-left') setPeerLeft(true);
      else if (msg.t === 'sync') {
        // The shooter's result wins, even if our replay of the shot is still running
        // (a throttled background tab, say).
        waitingSyncRef.current = false;
        commit(msg.state);
        finishShot(msg.state);
      }
    });
  }, [online, shoot, advance, commit, finishShot]);

  const canAim = () => {
    const s = stateRef.current;
    return s.phase === 'aim' && isHuman(s.turn) && !peerLeft;
  };

  const pick = (e: React.PointerEvent) => sceneRef.current?.pick(e.clientX, e.clientY) ?? null;

  /** Distance from the pointer to a pen on screen, and where along the pen it is. */
  const hitOnScreen = (e: React.PointerEvent, p: PlayerId) =>
    sceneRef.current?.screenHit(stateRef.current.pens[p], e.clientX, e.clientY) ?? null;

  const endDrag = (canvas: HTMLCanvasElement) => {
    dragRef.current = null;
    canvas.style.cursor = 'default';
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    sounds.unlock();
    if (!canAim() || dragRef.current) return;
    const s = stateRef.current;
    const hit = hitOnScreen(e, s.turn);
    if (!hit || hit.dist > grabRadius(e)) return;
    const grab = pointOnPen(s.pens[s.turn], hit.along);
    dragRef.current = {
      along: hit.along,
      pressDesk: grab,
      currentDesk: pick(e) ?? grab,
      pressScreen: { x: e.clientX, y: e.clientY },
      currentScreen: { x: e.clientX, y: e.clientY },
    };
    shownFlickRef.current = null;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.style.cursor = 'grabbing';
    buzz(8);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag) {
      // Use the latest of any coalesced moves for the freshest position.
      const latest = e.nativeEvent.getCoalescedEvents?.().at(-1) ?? e.nativeEvent;
      drag.currentScreen = { x: latest.clientX, y: latest.clientY };
      const p = sceneRef.current?.pick(latest.clientX, latest.clientY);
      if (p) drag.currentDesk = p;
      return;
    }
    // Hover: show what the pointer can do here.
    const s = stateRef.current;
    const radius = grabRadius(e);
    const overMine = canAim() && (hitOnScreen(e, s.turn)?.dist ?? Infinity) <= radius;
    const overOther =
      !overMine && ([0, 1] as const).some((p) => (hitOnScreen(e, p)?.dist ?? Infinity) <= radius && !s.pens[p].out);
    hoverRef.current = overMine;
    e.currentTarget.style.cursor = overMine ? 'grab' : overOther ? 'not-allowed' : 'default';
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    endDrag(e.currentTarget);
    if (!drag || !canAim() || pullPixels(drag) < MIN_PULL_PX) return;
    shoot(flickFromPull(drag, maxPull(e.currentTarget)), true);
    buzz(15);
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    endDrag(e.currentTarget);
  };

  const onPointerLeave = () => {
    hoverRef.current = false;
  };

  const toggleSound = () => {
    sounds.unlock();
    sounds.setMuted(!muted);
    setMuted(!muted);
  };

  let status: string;
  if (hud.phase === 'moving') status = 'Pens moving…';
  else if (hud.phase !== 'aim') status = '';
  else if (!isHuman(hud.turn)) status = `${names[hud.turn]} is aiming…`;
  else {
    const who = mode === 'local' ? `${names[hud.turn]}'s turn` : 'Your turn';
    status = `${who}: press on your pen, pull back and let go.`;
  }

  const over = hud.phase === 'roundOver' || hud.phase === 'matchOver';
  const winner = hud.roundWinner;
  const loser = winner === null ? null : winner === 0 ? 1 : 0;

  return (
    <main className="game">
      <header className="game-bar">
        <div className="scoreboard" aria-label="Score">
          {([0, 1] as const).map((p) => (
            <div key={p} className={`score-chip${hud.turn === p && hud.phase === 'aim' ? ' is-turn' : ''}`}>
              <span className="dot" style={{ background: PLAYER_COLORS[p] }} aria-hidden />
              <span className="score-who">
                <span className="score-name">{names[p]}</span>
                <span className="score-pen">{penModel(hud.models[p]).name}</span>
              </span>
              <span className="score-value">{hud.scores[p]}</span>
            </div>
          ))}
          <span className="round-label">
            Round {hud.round} · first to {WIN_SCORE}
          </span>
        </div>
        <div className="game-actions">
          <button type="button" className="btn btn-secondary" onClick={toggleSound} aria-pressed={!muted}>
            {muted ? 'Sound off' : 'Sound on'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onExit}>
            Leave game
          </button>
        </div>
      </header>

      <p className="status" aria-live="polite">
        {status}
      </p>

      <div className="desk-wrap">
        <canvas
          ref={canvasRef}
          className="desk"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onPointerLeave={onPointerLeave}
        />

        {over && winner !== null && loser !== null && !peerLeft && (
          <div className="overlay" role="dialog" aria-labelledby="result-title">
            <div className="card paper">
              <h2 id="result-title">
                {names[winner]} {wins(names[winner])} the {hud.phase === 'matchOver' ? 'match!' : 'round'}
              </h2>
              <p>
                {hud.roundReason === 'knocked'
                  ? `${names[winner]} knocked ${names[loser]} off the desk.`
                  : `${names[loser]} slid off the desk.`}{' '}
                Score {hud.scores[0]}–{hud.scores[1]}.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => advance(true)} autoFocus>
                {hud.phase === 'matchOver' ? 'Play again' : 'Next round'}
              </button>
            </div>
          </div>
        )}

        {peerLeft && (
          <div className="overlay" role="dialog" aria-labelledby="left-title">
            <div className="card paper">
              <h2 id="left-title">Your opponent left</h2>
              <p>The connection to the other player closed.</p>
              <button type="button" className="btn btn-primary" onClick={onExit} autoFocus>
                Back to menu
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
