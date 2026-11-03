import { useCallback, useEffect, useRef, useState } from 'react';
import { sounds } from '../audio/sounds';
import { DIFFICULTY, chooseAiShot, type Difficulty } from '../game/ai';
import { MIN_PULL_PX, easeFlick, flickFromPull, pullPixels, pullPower, type Drag } from '../game/aiming';
import { MAX_IMPULSE, pointOnPen } from '../game/physics';
import { isMetalPen, penModel } from '../game/pens';
import { PLAYER_COLORS } from '../game/players';
import { power as powerOf, type PowerId } from '../game/powers';
import type { Room } from '../game/rooms';
import { WIN_SCORE, isFinalRound, matchWinner, newMatch, nextRound, other, resolveShot } from '../game/rules';
import { DeskScene, type Aim } from '../game/scene3d';
import type { Flick, GameState, Loadout, PlayerId } from '../game/types';
import { DT, DeskWorld, type Impact } from '../game/world';
import type { OnlineClient } from '../net/client';
import type { PrizeKind } from '../net/protocol';
import { MAX_PENS, type OwnedPen, type PrizeChoice } from '../profile/economy';
import { MatchRecorder } from '../recording/recorder';
import { getMatchStore } from '../recording/store';
import { PenBox, PenLabel, PenSwatch, Rupees } from './PenBox';

export type Mode = 'local' | 'ai' | 'online';

/** Everything a match needs to know before it starts. */
export interface MatchSetup {
  mode: Mode;
  room: Room;
  /** Rupees and pens are on the line (not in practice). */
  staked: boolean;
  names: [string, string];
  loadouts: [Loadout, Loadout];
  /** Each player's pencil box, for the swap choice; null where unknown (an online opponent). */
  boxes: [OwnedPen[] | null, OwnedPen[] | null];
  difficulty: Difficulty;
}

interface Props {
  setup: MatchSetup;
  online?: { client: OnlineClient; me: PlayerId };
  /** A staked match is settled: who won, and what they did with the loser's pen (null: took it). */
  onSettle?: (winner: PlayerId, choice: PrizeChoice | null) => void;
  onExit: () => void;
}

const AI_DELAY_MS = 700;
/** How quickly the shown aim catches up with the pointer (per second). */
const AIM_EASE = 30;
/** Slide speed (desk px/s) at which the scrape sound is loudest. */
const LOUD_SLIDE = 900;
/** Chalk colours for each player's score on the bench. */
const CHALK: [string, string] = ['#8ec5ff', '#ff9ec4'];

/** A full-power pull, in CSS px: about a third of the desk view. */
const maxPull = (canvas: HTMLCanvasElement) => Math.max(90, 0.32 * Math.min(canvas.clientWidth, canvas.clientHeight));

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

/** The end of a staked match, step by step. */
type Prize =
  | { step: 'none' }
  /** The winner is choosing (on this device). */
  | { step: 'choose'; swapping: boolean }
  /** Waiting for the online winner to choose. */
  | { step: 'waiting' }
  | { step: 'breaking'; kind: PrizeKind }
  | { step: 'done'; kind: PrizeKind };

export function GameView({ setup, online, onSettle, onExit }: Props) {
  const { mode, room, staked, names, loadouts, boxes, difficulty } = setup;
  const me: PlayerId = online?.me ?? 0;
  const isHuman = useCallback((p: PlayerId) => mode === 'local' || p === me, [mode, me]);
  const you = (p: PlayerId) => (mode === 'local' ? names[p] : p === me ? 'You' : names[p]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(newMatch(loadouts));
  const [hud, setHud] = useState<GameState>(stateRef.current);
  const shooterRef = useRef<PlayerId>(0);
  const dragRef = useRef<Drag | null>(null);
  const shownFlickRef = useRef<Flick | null>(null);
  const hoverRef = useRef(false);
  // Online: the side that did not shoot waits for the shooter's settled state.
  const waitingSyncRef = useRef(false);
  const [peerLeft, setPeerLeft] = useState(false);
  const [muted, setMuted] = useState(sounds.muted);
  const [chatter, setChatter] = useState(sounds.chatterVolume);
  const [busy, setBusy] = useState(true);
  const [banner, setBanner] = useState<{ text: string; key: number } | null>(null);
  const [shout, setShout] = useState<{ text: string; color: string; key: number } | null>(null);
  const [prize, setPrize] = useState<Prize>({ step: 'none' });
  const [dropUid, setDropUid] = useState<string | null>(null);
  const settledRef = useRef(false);
  // The Rapier world and the three.js view; created with the canvas loop below.
  const worldRef = useRef<DeskWorld | null>(null);
  const sceneRef = useRef<DeskScene | null>(null);
  const recorderRef = useRef<MatchRecorder | null>(null);

  const startRecording = useCallback(() => {
    recorderRef.current = new MatchRecorder(getMatchStore(), {
      mode,
      players: [
        { name: names[0], model: loadouts[0].model },
        { name: names[1], model: loadouts[1].model },
      ],
      me: mode === 'local' ? null : me,
    });
  }, [mode, me, names, loadouts]);
  if (!recorderRef.current) startRecording();

  const commit = useCallback((s: GameState) => {
    const before = stateRef.current.phase;
    stateRef.current = s;
    setHud(s);
    // The class claps for whoever just won the round, and cheers the match winner.
    const won = s.phase === 'matchOver' ? 'match' : s.phase === 'roundOver' && s.roundWinner !== null ? 'round' : null;
    if (won && before !== s.phase) sounds.applause(won);
    // Any state at rest (a new round, the shooter's synced result) is placed exactly.
    if (s.phase !== 'moving') worldRef.current?.load(s.pens);
  }, []);

  /** A shot is over: record how it ended. */
  const finishShot = useCallback((s: GameState) => {
    void recorderRef.current?.endShot(s);
  }, []);

  /** Plays both pens' entrances; play waits until they've landed. */
  const runIntro = useCallback((s: GameState) => {
    const scene = sceneRef.current;
    if (!scene) return;
    setBusy(true);
    const seconds = scene.playIntro(s.loadouts);
    window.setTimeout(() => setBusy(false), seconds * 1000);
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
      const strength = Math.min(1, Math.hypot(flick.ix, flick.iy) / MAX_IMPULSE);
      sounds.flick(strength);
      const pw = s.loadouts[s.turn].power;
      if (pw) sounds.hero(pw, 0.3);
      sceneRef.current?.playFlick({ pen: s.pens[s.turn], flick }, pw);
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
      else if (s.phase === 'matchOver' && !staked) {
        startRecording();
        const fresh = newMatch(s.loadouts);
        commit(fresh);
        runIntro(fresh);
      } else return;
      if (broadcast && online) void online.client.send({ t: 'next' });
    },
    [commit, online, startRecording, staked, runIntro],
  );

  /** Ends a staked match: records the settlement once, after any break animation. */
  const settle = useCallback(
    (kind: PrizeKind, broadcast: boolean) => {
      const winner = matchWinner(stateRef.current);
      if (winner === null || settledRef.current) return;
      if (broadcast && online) void online.client.send({ t: 'prize', kind });
      const finish = () => {
        settledRef.current = true;
        const choice: PrizeChoice | null =
          kind === 'take' ? null : kind === 'swap' ? { kind: 'swap', dropUid: dropUidRef.current ?? '' } : { kind };
        onSettle?.(winner, choice);
        setPrize({ step: 'done', kind });
      };
      if (kind === 'break') {
        setPrize({ step: 'breaking', kind });
        const s = stateRef.current;
        sceneRef.current?.playBreak(s.pens[winner], { ...s.pens[other(winner)] }, finish);
      } else finish();
    },
    [online, onSettle],
  );
  const dropUidRef = useRef<string | null>(null);
  dropUidRef.current = dropUid;

  // When a staked match ends, decide who chooses what happens to the loser's pen.
  useEffect(() => {
    if (!staked || hud.phase !== 'matchOver' || prize.step !== 'none') return;
    const winner = matchWinner(hud);
    if (winner === null) return;
    if (mode === 'online' && winner !== me) setPrize({ step: 'waiting' });
    else setPrize({ step: 'choose', swapping: false });
  }, [staked, hud, prize.step, mode, me]);

  // Physics, sound and the 3D view, every animation frame.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const world = new DeskWorld(stateRef.current.pens, true);
    const scene = new DeskScene(canvas, room.theme, mode === 'online' ? me : 0);
    scene.setLoadouts(stateRef.current.loadouts);
    scene.onShout = (text, color, pw) => {
      setShout({ text, color, key: performance.now() });
      if (pw) sounds.hero(pw);
    };
    scene.onBreak = () => {
      sounds.snap();
      buzz(60);
    };
    // Handle for poking at the scene from the browser console while developing.
    if (import.meta.env.DEV) Object.assign(window, { __penfight: { scene, state: stateRef, sounds } });
    worldRef.current = world;
    sceneRef.current = scene;
    sounds.startChatter(room.theme.noise);
    let raf = 0;
    let last = performance.now();
    let acc = 0;

    const observer = new ResizeObserver(() => scene.resize(canvas.clientWidth, canvas.clientHeight));
    observer.observe(canvas);
    scene.resize(canvas.clientWidth, canvas.clientHeight);
    runIntro(stateRef.current);

    const playImpacts = (impacts: Impact[], s: GameState) => {
      const metal = isMetalPen(s.loadouts[0].model) || isMetalPen(s.loadouts[1].model);
      for (const i of impacts) {
        if (i.kind === 'pens') {
          sounds.penHit(i.strength, metal);
          const pw = s.loadouts[shooterRef.current].power;
          scene.strike(s.pens, pw, i.strength);
          buzz(10 + i.strength * 25);
        } else if (i.kind === 'desk') sounds.deskTap(i.strength);
        else sounds.fall(isMetalPen(s.loadouts[i.pen].model));
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
        const shown = shownFlickRef.current ? easeFlick(shownFlickRef.current, target, 1 - Math.exp(-dt * AIM_EASE)) : target;
        shownFlickRef.current = shown;
        // Only the direction is shown; the dashes turn red at a full stretch.
        aim = { pen, flick: shown, pointer: drag.currentDesk, full: pullPower(drag, maxPull(canvas)) >= 1 };
      } else {
        shownFlickRef.current = null;
      }
      scene.render(cur.pens, aim, cur.phase === 'aim' ? cur.turn : null, now / 1000, hoverRef.current);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      sounds.slide(0);
      sounds.stopApplause();
      sounds.stopChatter();
      worldRef.current = null;
      sceneRef.current = null;
      world.free();
      scene.dispose();
    };
    // The scene is built once per match.
  }, []);

  // The score, chalked on the bench in front.
  useEffect(() => {
    sceneRef.current?.setScore({
      names: [you(0), you(1)],
      colors: CHALK,
      scores: hud.scores,
      round: hud.round,
      final: isFinalRound(hud) && hud.phase !== 'matchOver',
      target: WIN_SCORE,
    });
    // `you` only depends on fixed setup.
  }, [hud.scores, hud.round, hud.phase]);

  // Whose turn it is, in big letters, each time it changes.
  useEffect(() => {
    if (busy || hud.phase !== 'aim') return;
    const text = isHuman(hud.turn) ? (mode === 'local' ? `${names[hud.turn]}'s turn` : 'Your turn!') : `${names[hud.turn]}'s turn`;
    setBanner({ text, key: performance.now() });
  }, [busy, hud.phase, hud.turn, hud.round, isHuman, mode, names]);

  // Computer's turn.
  useEffect(() => {
    if (mode !== 'ai' || busy || hud.phase !== 'aim' || hud.turn !== 1) return;
    const { samples, wobble } = DIFFICULTY[difficulty];
    const id = window.setTimeout(() => shoot(chooseAiShot(stateRef.current, 1, { samples, wobble }), false), AI_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [mode, busy, hud.phase, hud.turn, shoot, difficulty]);

  // Opponent's moves arriving from the relay.
  useEffect(() => {
    if (!online) return;
    return online.client.subscribe((msg) => {
      if (msg.t === 'shot') shoot(msg.flick, false);
      else if (msg.t === 'next') advance(false);
      else if (msg.t === 'peer-left') {
        setPeerLeft(true);
        // A winner who leaves before choosing still takes the pen.
        const s = stateRef.current;
        if (staked && s.phase === 'matchOver' && matchWinner(s) !== me) settle('take', false);
      }
      else if (msg.t === 'prize') settle(msg.kind, false);
      else if (msg.t === 'sync') {
        // The shooter's result wins, even if our replay of the shot is still running
        // (a throttled background tab, say).
        waitingSyncRef.current = false;
        commit(msg.state);
        finishShot(msg.state);
      }
    });
  }, [online, shoot, advance, commit, finishShot, settle, staked, me]);

  const canAim = () => {
    const s = stateRef.current;
    return s.phase === 'aim' && isHuman(s.turn) && !peerLeft && !sceneRef.current?.busy();
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

  const toggleSound = () => {
    sounds.unlock();
    sounds.setMuted(!muted);
    setMuted(!muted);
  };

  const changeChatter = (v: number) => {
    sounds.unlock();
    sounds.setChatterVolume(v);
    setChatter(v);
  };

  let status: string;
  if (busy) status = 'Here come the pens…';
  else if (hud.phase === 'moving') status = 'Pens moving…';
  else if (hud.phase !== 'aim') status = '';
  else if (!isHuman(hud.turn)) status = `${names[hud.turn]} is aiming…`;
  else status = 'Press on your pen, pull back and let go.';

  const winner = hud.phase === 'matchOver' ? matchWinner(hud) : hud.roundWinner;
  const loser = winner === null ? null : other(winner);
  const final = isFinalRound(hud);

  return (
    <main className="game">
      <header className="game-bar">
        <div className="scoreboard" aria-label="Score">
          {([0, 1] as const).map((p) => (
            <div key={p} className={`score-chip${hud.turn === p && hud.phase === 'aim' ? ' is-turn' : ''}`}>
              <span className="dot" style={{ background: PLAYER_COLORS[p] }} aria-hidden />
              <span className="score-who">
                <span className="score-name">{you(p)}</span>
                <span className="score-pen">
                  {penModel(hud.loadouts[p].model).name}
                  {hud.loadouts[p].power && ` · ${powerOf(hud.loadouts[p].power as PowerId).name}`}
                </span>
              </span>
              <span className="score-value">{hud.scores[p]}</span>
            </div>
          ))}
          <span className="round-label">
            {staked ? (
              <>
                <Rupees amount={room.bet} /> bet ·{' '}
              </>
            ) : (
              'Practice · '
            )}
            Best of 3{final && hud.phase !== 'matchOver' ? ' · final round' : ''}
          </span>
        </div>
        <div className="game-actions">
          <label className="noise-control">
            <span>Class noise</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={chatter}
              onChange={(e) => changeChatter(Number(e.target.value))}
              aria-valuetext={chatter === 0 ? 'off' : `${Math.round(chatter * 100)}%`}
            />
          </label>
          <button type="button" className="btn btn-secondary btn-small" onClick={toggleSound} aria-pressed={!muted}>
            {muted ? 'Sound off' : 'Sound on'}
          </button>
          <button type="button" className="btn btn-secondary btn-small" onClick={onExit}>
            Leave
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
          onPointerCancel={(e) => endDrag(e.currentTarget)}
          onPointerLeave={() => {
            hoverRef.current = false;
          }}
        />

        {banner && (
          <div key={banner.key} className="turn-banner" aria-hidden>
            {banner.text}
          </div>
        )}
        {shout && (
          <div key={shout.key} className="shout" style={{ color: shout.color }} aria-hidden>
            {shout.text}
          </div>
        )}

        {hud.phase === 'roundOver' && !peerLeft && (
          <div className="overlay" role="dialog" aria-labelledby="result-title">
            <div className="card paper">
              <h2 id="result-title">
                {winner === null ? 'Draw!' : `${you(winner)} ${you(winner) === 'You' ? 'win' : 'wins'} the round`}
              </h2>
              <p>
                {hud.roundReason === 'draw'
                  ? 'Both pens went off the desk together. No point to anyone.'
                  : hud.roundReason === 'knocked'
                    ? `${you(winner!)} knocked ${you(loser!)} off the desk.`
                    : `${you(loser!)} slid off the desk.`}{' '}
                Score {hud.scores[0]}–{hud.scores[1]}.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => advance(true)} autoFocus>
                {isFinalRound(hud) ? 'Final round' : 'Next round'}
              </button>
            </div>
          </div>
        )}

        {hud.phase === 'matchOver' && !staked && winner !== null && (
          <div className="overlay" role="dialog" aria-labelledby="match-title">
            <div className="card paper">
              <h2 id="match-title">
                {you(winner)} {you(winner) === 'You' ? 'win' : 'wins'} the match!
              </h2>
              <p>
                Score {hud.scores[0]}–{hud.scores[1]}. Practice games don&apos;t change your money or pens.
              </p>
              <button type="button" className="btn btn-primary" onClick={() => advance(true)} autoFocus>
                Play again
              </button>
              <button type="button" className="btn btn-secondary" onClick={onExit}>
                Back to menu
              </button>
            </div>
          </div>
        )}

        {staked && winner !== null && loser !== null && prize.step !== 'none' && prize.step !== 'breaking' && (
          <div className="overlay" role="dialog" aria-labelledby="prize-title">
            <div className="card paper prize-card">
              <h2 id="prize-title">
                {you(winner)} {you(winner) === 'You' ? 'win' : 'wins'} the match!
              </h2>
              <p className="prize-line">
                <PenSwatch model={hud.loadouts[loser].model} power={hud.loadouts[loser].power} />
                <span>
                  ₹{room.bet} and {you(loser) === 'You' ? 'your' : `${names[loser]}'s`}{' '}
                  <PenLabel pen={hud.loadouts[loser]} />
                </span>
              </p>

              {prize.step === 'waiting' && <p className="waiting">{names[winner]} is deciding what to do with your pen…</p>}

              {prize.step === 'choose' && !prize.swapping && (boxes[winner]?.length ?? 0) < MAX_PENS && (
                <button type="button" className="btn btn-primary" onClick={() => settle('take', true)} autoFocus>
                  Put it in {mode === 'local' ? `${names[winner]}'s` : 'my'} pencil box
                </button>
              )}

              {prize.step === 'choose' && !prize.swapping && (boxes[winner]?.length ?? 0) >= MAX_PENS && (
                <>
                  <p>
                    {mode === 'local' ? `${names[winner]}'s` : 'Your'} pencil box is full ({MAX_PENS} pens). What happens to the
                    prize pen?
                  </p>
                  <div className="prize-actions">
                    <button type="button" className="btn btn-primary" onClick={() => setPrize({ step: 'choose', swapping: true })}>
                      Swap it for one of mine
                    </button>
                    <button type="button" className="btn btn-danger" onClick={() => settle('break', true)}>
                      Break it
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => settle('return', true)}>
                      Give it back
                    </button>
                  </div>
                </>
              )}

              {prize.step === 'choose' && prize.swapping && boxes[winner] && (
                <>
                  <PenBox pens={boxes[winner]!} selected={dropUid} onSelect={setDropUid} label="Throw away which pen?" />
                  <div className="prize-actions">
                    <button type="button" className="btn btn-primary" disabled={!dropUid} onClick={() => settle('swap', true)}>
                      Swap
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setPrize({ step: 'choose', swapping: false })}>
                      Back
                    </button>
                  </div>
                </>
              )}

              {prize.step === 'done' && (
                <>
                  <p className="stamp-note">
                    {prize.kind === 'break'
                      ? `${you(winner)} broke ${you(loser) === 'You' ? 'your' : `${names[loser]}'s`} pen!`
                      : prize.kind === 'return'
                        ? `${you(winner)} gave the pen back.`
                        : `The pen now belongs to ${you(winner) === 'You' ? 'you' : names[winner]}.`}
                  </p>
                  <button type="button" className="btn btn-primary" onClick={onExit} autoFocus>
                    Back to menu
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {peerLeft && !(staked && hud.phase === 'matchOver') && (
          <div className="overlay" role="dialog" aria-labelledby="left-title">
            <div className="card paper">
              <h2 id="left-title">Your opponent left</h2>
              <p>The connection to the other player closed{staked && hud.phase !== 'matchOver' ? ', so no bet was settled' : ''}.</p>
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
