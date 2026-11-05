import { useCallback, useEffect, useRef, useState } from 'react';
import { sounds } from '../audio/sounds';
import { DIFFICULTY, chooseAiBoost, chooseAiShotSoon, type Difficulty } from '../game/ai';
import type { BoostView } from '../game/boostFx';
import { boost as boostOf, isBoostId, type BoostBag, type BoostId } from '../game/boosts';
import { MIN_PULL_PX, easeFlick, flickFromPull, pullPixels, pullPower, type Drag } from '../game/aiming';
import { MAX_IMPULSE, interpolatePen, pointOnPen } from '../game/physics';
import { isMetalPen, penModel } from '../game/pens';
import { PLAYER_COLORS } from '../game/players';
import { power as powerOf, type PowerId } from '../game/powers';
import { resolveQuality } from '../game/quality';
import type { Room } from '../game/rooms';
import {
  WIN_SCORE,
  armBoost,
  boostProblem,
  chosenBoost,
  disarmBoost,
  isFinalRound,
  matchWinner,
  newMatch,
  nextRound,
  other,
  resolveShot,
  shotMods,
} from '../game/rules';
import { DeskScene, type Aim } from '../game/scene3d';
import type { Flick, GameState, Loadout, Pen, PlayerId } from '../game/types';
import { DT, DeskWorld, type Impact } from '../game/world';
import type { GameLink } from '../net/link';
import type { PrizeKind } from '../net/protocol';
import { MAX_PENS, type OwnedPen, type PrizeChoice } from '../profile/economy';
import { MatchRecorder } from '../recording/recorder';
import { SHOT_LABELS, bestShots, isNewBest, type Highlight } from '../recording/highlights';
import { REPLAY_SPEED, replayPose } from '../recording/replay';
import { getMatchStore } from '../recording/store';
import { PenBox, PenLabel, PenSwatch, Rupees } from './PenBox';
import { Powers } from './Powers';

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
  /** Whether each player's pencil box has room for a won pen. */
  boxRoom: [boolean, boolean];
  /** Super powers each player on this device can use; null for an online opponent. */
  bags: [BoostBag | null, BoostBag | null];
  difficulty: Difficulty;
}

interface Props {
  setup: MatchSetup;
  online?: { client: GameLink; me: PlayerId };
  /** A staked match is settled: who won, and what they did with the loser's pen (null: took it). */
  onSettle?: (winner: PlayerId, choice: PrizeChoice | null) => void;
  /** A player used up one of their super powers. */
  onSpendBoost?: (player: PlayerId, id: BoostId) => void;
  onExit: () => void;
}

/** Long enough for the player to use a power against the computer's shot. */
const AI_DELAY_MS = 1500;
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

/** How often (ms) an online shooter's aim is sent to the other player. */
const AIM_SEND_MS = 80;

/** A short vibration on phones that support it. */
const buzz = (ms: number) => {
  try {
    navigator.vibrate?.(Math.round(ms));
  } catch {
    // Some browsers block vibration until the page has been interacted with.
  }
};

/** What the scene should show for the super powers in a state; `shooter` is whose shot is under way. */
function boostView(s: GameState, shooter: PlayerId): BoostView {
  const live = s.phase === 'aim' || s.phase === 'moving';
  const active = s.phase === 'moving' ? shooter : s.turn;
  const view: BoostView = { wall: null, ice: 0, tilt: null, grip: [false, false], lives: live ? s.lives : [0, 0], charged: [null, null] };
  if (!live) return view;
  for (const a of s.armed) {
    const now = a.target === active;
    if (a.id === 'wall') view.wall = { by: a.by, active: now };
    else if (a.id === 'ice') view.ice = Math.max(view.ice, now ? 1 : 0.3);
    else if (a.id === 'tilt' && now) view.tilt = a.target;
    else if (a.id === 'grip') view.grip[a.by] = true;
    else if (a.target === a.by) view.charged[a.by] = a.id;
  }
  return view;
}

/** A line about super powers waiting for the shot about to be taken. */
function boostNote(s: GameState, name: (p: PlayerId) => string): string | null {
  if (s.phase !== 'aim') return null;
  const against = s.armed.filter((a) => a.target === s.turn && a.by !== s.turn);
  if (!against.length) return null;
  return against.map((a) => `${name(a.by)} used ${boostOf(a.id).name}.`).join(' ');
}

/** The end of a staked match, step by step. */
type Prize =
  | { step: 'none' }
  /** The winner is choosing (on this device). */
  | { step: 'choose'; swapping: boolean }
  /** Waiting for the online winner to choose. */
  | { step: 'waiting' }
  | { step: 'breaking'; kind: PrizeKind }
  | { step: 'done'; kind: PrizeKind };

export function GameView({ setup, online, onSettle, onSpendBoost, onExit }: Props) {
  const { mode, room, staked, names, loadouts, boxes, boxRoom, bags, difficulty } = setup;
  const me: PlayerId = online?.me ?? 0;
  const isHuman = useCallback((p: PlayerId) => mode === 'local' || p === me, [mode, me]);
  const you = (p: PlayerId) => (mode === 'local' ? names[p] : p === me ? 'You' : names[p]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>(newMatch(loadouts));
  const [hud, setHud] = useState<GameState>(stateRef.current);
  const shooterRef = useRef<PlayerId>(0);
  const dragRef = useRef<Drag | null>(null);
  const shownFlickRef = useRef<Flick | null>(null);
  // Online: the opponent's aim as they pull back, and when ours was last sent.
  const remoteAimRef = useRef<Flick | null>(null);
  const aimSentRef = useRef(0);
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
  const [swapError, setSwapError] = useState<string | null>(null);
  const [confirmBreak, setConfirmBreak] = useState(false);
  // After the match: the winner's best shots, replayed before the result card.
  const [replay, setReplay] = useState<{ shots: Highlight[]; index: number; winner: PlayerId } | null>(null);
  const replayRef = useRef<{ shot: Highlight; start: number } | null>(null);
  const replayedRef = useRef(false);
  const headerRef = useRef<HTMLElement>(null);
  const settledRef = useRef(false);
  // The Rapier world and the three.js view; created with the canvas loop below.
  const worldRef = useRef<DeskWorld | null>(null);
  const sceneRef = useRef<DeskScene | null>(null);
  const recorderRef = useRef<MatchRecorder | null>(null);
  // Super powers left this match: from each player's bag, or the practice set.
  const [left, setLeft] = useState<[BoostBag | null, BoostBag | null]>(() => [bags[0] && { ...bags[0] }, bags[1] && { ...bags[1] }]);
  const leftRef = useRef(left);
  leftRef.current = left;
  // The computer uses only so many super powers a match.
  const aiBoostsRef = useRef(DIFFICULTY[difficulty].boosts);
  // Every player gets one free super power a match, any one they like.
  const [free, setFree] = useState<[boolean, boolean]>([bags[0] !== null, bags[1] !== null]);
  const freeRef = useRef(free);
  freeRef.current = free;
  // Each player's list of powers floats up only when their powers button is tapped.
  const [powersOpen, setPowersOpen] = useState<[boolean, boolean]>([false, false]);
  const [boostMsg, setBoostMsg] = useState<{ player: PlayerId; text: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const spendRef = useRef(onSpendBoost);
  spendRef.current = onSpendBoost;

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
    const prevSaved = stateRef.current.saved;
    stateRef.current = s;
    setHud(s);
    // The class claps for whoever just won the round, and cheers the match winner.
    const won = s.phase === 'matchOver' ? 'match' : s.phase === 'roundOver' && s.roundWinner !== null ? 'round' : null;
    if (won && before !== s.phase) sounds.applause(won);
    // Health Boost brought a pen back in the shot just resolved.
    if (s.saved.length && s.saved !== prevSaved) {
      for (const p of s.saved) sceneRef.current?.saved(s.pens[p]);
      sounds.saved();
    }
    sceneRef.current?.setBoosts(boostView(s, shooterRef.current));
    // Any state at rest (a new round, the shooter's synced result) is placed exactly.
    if (s.phase !== 'moving') worldRef.current?.load(s.pens);
  }, []);

  /** A shot is over: record how it ended. */
  const finishShot = useCallback((s: GameState) => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    void recorder.endShot(s);
    // A shot that beats the player's own earlier ones gets a call-out.
    const record = recorder.snapshot();
    const last = record.shots.at(-1);
    if (last && isNewBest(record, last)) {
      window.setTimeout(() => setShout({ text: 'BEST SHOT!', color: '#ffd166', key: performance.now() }), 350);
    }
  }, []);

  /** Plays both pens' entrances; play waits until they've landed. */
  const runIntro = useCallback((s: GameState) => {
    const scene = sceneRef.current;
    if (!scene) return;
    setBusy(true);
    const seconds = scene.playIntro(s.loadouts);
    window.setTimeout(() => setBusy(false), seconds * 1000);
  }, []);

  /** Uses up a super power: the match's free one first, then one the player bought. */
  const spendBoost = useCallback((player: PlayerId, id: BoostId) => {
    // Only for players whose powers live on this device.
    const bag = leftRef.current[player];
    if (!bag) return;
    if (freeRef.current[player]) {
      const next: [boolean, boolean] = [...freeRef.current];
      next[player] = false;
      freeRef.current = next;
      setFree(next);
      return;
    }
    const left: [BoostBag | null, BoostBag | null] = [...leftRef.current];
    left[player] = { ...bag, [id]: Math.max(0, (bag[id] ?? 0) - 1) };
    leftRef.current = left;
    setLeft(left);
    spendRef.current?.(player, id);
  }, []);

  /**
   * Arms or takes back a super power for `player`: the shooter for their own
   * shot, or the other player against it. `fromPeer` is an online opponent's
   * choice, already checked on their device.
   */
  const toggleBoost = useCallback(
    (player: PlayerId, id: BoostId, fromPeer = false) => {
      const s = stateRef.current;
      const tell = (choice: BoostId | null) => {
        // Online, the shooter's browser needs to know what's being used against the shot.
        if (online && !fromPeer && player !== s.turn) void online.client.send({ t: 'defend', id: choice });
      };
      if (chosenBoost(s, player) === id) {
        commit(disarmBoost(s, player));
        setBoostMsg(null);
        tell(null);
        return true;
      }
      const problem = boostProblem(s, player, id);
      if (problem) {
        if (!fromPeer) setBoostMsg({ player, text: problem });
        return false;
      }
      const bag = leftRef.current[player];
      if (!fromPeer && bag && !freeRef.current[player] && (bag[id] ?? 0) <= 0) {
        setBoostMsg({ player, text: `You have no ${boostOf(id).name} left. Buy more in the store.` });
        return false;
      }
      sounds.unlock();
      commit(armBoost(s, player, id));
      setBoostMsg(null);
      sounds.boost(id);
      sceneRef.current?.armBoost(id, s.pens[player]);
      buzz(20);
      tell(id);
      return true;
    },
    [commit, online],
  );

  const shoot = useCallback(
    (flick: Flick, broadcast: boolean, remote: { boost: BoostId | null; defense: BoostId | null } | null = null) => {
      let s = stateRef.current;
      const world = worldRef.current;
      if (s.phase !== 'aim' || !world) return;
      const defender = other(s.turn);
      if (remote) {
        // An online shooter's flick says which powers it was taken with; that's what counts.
        if (remote.boost && s.boostThisTurn !== remote.boost) {
          s = armBoost(s, s.turn, remote.boost);
          sounds.boost(remote.boost);
          sceneRef.current?.armBoost(remote.boost, s.pens[s.turn]);
        }
        if (s.defenseThisTurn !== remote.defense) {
          if (s.defenseThisTurn) {
            s = disarmBoost(s, defender);
            const text = 'Too late: they had already flicked. Your power is still yours.';
            window.setTimeout(() => setBoostMsg({ player: defender, text }), 0);
          }
          if (remote.defense) s = armBoost(s, defender, remote.defense);
        }
      }
      const used = s.boostThisTurn;
      const defense = s.defenseThisTurn;
      if (used) spendBoost(s.turn, used);
      if (defense) spendBoost(defender, defense);
      // A clean world each shot, so both online players' browsers play it out identically.
      remoteAimRef.current = null;
      world.restart(s.pens);
      world.setMods(shotMods(s, s.turn), s.turn);
      world.flick(s.turn, flick);
      shooterRef.current = s.turn;
      recorderRef.current?.beginShot(s, flick);
      const strength = Math.min(1, Math.hypot(flick.ix, flick.iy) / MAX_IMPULSE);
      sounds.flick(strength);
      const pw = s.loadouts[s.turn].power;
      if (pw) sounds.hero(pw, 0.3);
      sceneRef.current?.playFlick({ pen: s.pens[s.turn], flick }, pw);
      commit({ ...s, phase: 'moving' });
      setBoostMsg(null);
      if (broadcast && online) void online.client.send({ t: 'shot', flick, boost: used, defense });
    },
    [commit, online, spendBoost],
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
        replayedRef.current = false;
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

  // When the match ends, replay the winner's best shots first.
  useEffect(() => {
    if (hud.phase !== 'matchOver' || replayedRef.current) return;
    replayedRef.current = true;
    const winner = matchWinner(hud);
    const record = recorderRef.current?.snapshot();
    if (winner === null || !record) return;
    const shots = bestShots(record, winner);
    if (shots.length) {
      setReplay({ shots, index: 0, winner });
      replayRef.current = { shot: shots[0], start: performance.now() };
    }
  }, [hud]);

  const nextReplay = useCallback(() => {
    setReplay((r) => {
      if (!r || r.index + 1 >= r.shots.length) {
        replayRef.current = null;
        return null;
      }
      replayRef.current = { shot: r.shots[r.index + 1], start: performance.now() };
      return { ...r, index: r.index + 1 };
    });
  }, []);
  const nextReplayRef = useRef(nextReplay);
  nextReplayRef.current = nextReplay;

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
    const scene = new DeskScene(canvas, room.theme, mode === 'online' ? me : 0, resolveQuality());
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
    if (import.meta.env.DEV) Object.assign(window, { __penfight: { scene, state: stateRef, sounds, commit, shoot, toggleBoost, remoteAim: remoteAimRef } });
    worldRef.current = world;
    sceneRef.current = scene;
    sounds.startChatter(room.theme.noise);
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    // The pens one physics step back, for drawing in between steps.
    let prev: [Pen, Pen] | null = null;

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
        } else if (i.kind === 'zap') {
          sounds.zap();
          scene.zap(world.read()[i.pen]);
          buzz(80);
        } else if (i.kind === 'wall') {
          sounds.wallHit(i.strength);
          scene.wallHit(i.strength);
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
          prev = world.read();
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
        prev = null;
        sounds.slide(0);
      }

      const cur = stateRef.current;
      const drag = dragRef.current;
      const pen = cur.pens[cur.turn];
      let aim: Aim | null = null;
      // An online opponent's aim arrives a few times a second; it eases the same way.
      const remote = !drag && cur.phase === 'aim' ? remoteAimRef.current : null;
      if (drag || remote) {
        // The shown aim eases after the pointer, so it glides instead of jittering.
        const target = drag ? flickFromPull(drag, maxPull(canvas)) : remote!;
        const ease = drag ? AIM_EASE : AIM_EASE / 3;
        const shown = shownFlickRef.current ? easeFlick(shownFlickRef.current, target, 1 - Math.exp(-dt * ease)) : target;
        shownFlickRef.current = shown;
        // Only the direction is shown; the dashes turn red at a full stretch.
        const full = drag ? pullPower(drag, maxPull(canvas)) >= 1 : Math.hypot(target.ix, target.iy) >= MAX_IMPULSE * 0.999;
        aim = { pen, flick: shown, pointer: drag ? drag.currentDesk : null, full };
      } else {
        shownFlickRef.current = null;
      }
      // While pens move, draw them between the last two physics steps for smooth motion.
      const t = acc / DT;
      const shown: [Pen, Pen] =
        prev && cur.phase === 'moving' ? [interpolatePen(prev[0], cur.pens[0], t), interpolatePen(prev[1], cur.pens[1], t)] : cur.pens;
      const playing = replayRef.current;
      if (playing) {
        const pens = replayPose(playing.shot, cur, (now - playing.start) * REPLAY_SPEED);
        if (pens) scene.render(pens, null, null, now / 1000, false);
        else {
          replayRef.current = null;
          nextReplayRef.current();
          scene.render(shown, null, null, now / 1000, false);
        }
      } else scene.render(shown, aim, cur.phase === 'aim' ? cur.turn : null, now / 1000, hoverRef.current);
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

  // While a result card is up, the board and bar behind it can't take focus.
  const overlayOpen =
    hud.phase === 'roundOver' || hud.phase === 'matchOver' || peerLeft;
  useEffect(() => {
    headerRef.current?.toggleAttribute('inert', overlayOpen);
    canvasRef.current?.toggleAttribute('inert', overlayOpen);
  }, [overlayOpen]);

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
    let shotTimer = 0;
    let cancelled = false;
    const id = window.setTimeout(() => {
      // Sometimes the computer arms a super power first, and gives it a moment to show.
      const bag = leftRef.current[1];
      const pick = bag && aiBoostsRef.current > 0 ? chooseAiBoost(stateRef.current, 1, bag) : null;
      if (pick) {
        aiBoostsRef.current -= 1;
        toggleBoost(1, pick);
      }
      shotTimer = window.setTimeout(async () => {
        const flick = await chooseAiShotSoon(stateRef.current, 1, { samples, wobble }, () => cancelled);
        if (flick && !cancelled) shoot(flick, false);
      }, pick ? 900 : 0);
    }, AI_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
      window.clearTimeout(shotTimer);
    };
  }, [mode, busy, hud.phase, hud.turn, shoot, difficulty, toggleBoost]);

  // While you aim, the computer may use a power against your shot.
  useEffect(() => {
    if (mode !== 'ai' || busy || hud.phase !== 'aim' || hud.turn !== 0) return;
    const id = window.setTimeout(() => {
      const bag = leftRef.current[1];
      const s = stateRef.current;
      if (!bag || aiBoostsRef.current <= 0 || s.phase !== 'aim' || s.turn !== 0) return;
      const pick = chooseAiBoost(s, 1, bag);
      if (pick) {
        aiBoostsRef.current -= 1;
        toggleBoost(1, pick);
      }
    }, 1400);
    return () => window.clearTimeout(id);
  }, [mode, busy, hud.phase, hud.turn, hud.round, toggleBoost]);

  // Opponent's moves arriving from the relay.
  useEffect(() => {
    if (!online) return;
    return online.client.subscribe((msg) => {
      if (msg.t === 'shot') {
        shoot(msg.flick, false, {
          boost: isBoostId(msg.boost) ? msg.boost : null,
          defense: isBoostId(msg.defense) ? msg.defense : null,
        });
      } else if (msg.t === 'defend') {
        // The other player used (or took back) a power against our shot.
        const s = stateRef.current;
        if (s.phase === 'aim' && s.turn === me) {
          const theirs = chosenBoost(s, other(me));
          if (msg.id && isBoostId(msg.id)) toggleBoost(other(me), msg.id, true);
          else if (theirs) toggleBoost(other(me), theirs, true);
        }
      }
      else if (msg.t === 'aim') remoteAimRef.current = msg.flick;
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
  }, [online, shoot, advance, commit, finishShot, settle, staked, me, toggleBoost]);

  const canAim = () => {
    const s = stateRef.current;
    return s.phase === 'aim' && isHuman(s.turn) && !peerLeft && !sceneRef.current?.busy();
  };

  const pick = (e: React.PointerEvent) => sceneRef.current?.pick(e.clientX, e.clientY) ?? null;

  /** Distance from the pointer to a pen on screen, and where along the pen it is. */
  const hitOnScreen = (e: React.PointerEvent, p: PlayerId) =>
    sceneRef.current?.screenHit(stateRef.current.pens[p], e.clientX, e.clientY) ?? null;

  /** Online: tells the opponent where we're aiming, at most every `AIM_SEND_MS`. */
  const sendAim = (flick: Flick | null) => {
    if (!online) return;
    const now = performance.now();
    if (flick && now - aimSentRef.current < AIM_SEND_MS) return;
    aimSentRef.current = flick ? now : 0;
    void online.client.send({ t: 'aim', flick });
  };

  const endDrag = (canvas: HTMLCanvasElement) => {
    if (dragRef.current) sendAim(null);
    dragRef.current = null;
    canvas.style.cursor = 'default';
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    sounds.unlock();
    // Touching the desk to play puts the powers and the menu away.
    setPowersOpen([false, false]);
    setBoostMsg(null);
    setMenuOpen(false);
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
      if (pullPixels(drag) >= MIN_PULL_PX) sendAim(flickFromPull(drag, maxPull(e.currentTarget)));
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
  const note = boostNote(hud, (p) => you(p));
  // Each player on this device has their own powers: for their shot, or against the other's.
  const inPlay = !busy && (hud.phase === 'aim' || hud.phase === 'moving') && !peerLeft;
  const seats = ([0, 1] as const).filter((p) => left[p] !== null && isHuman(p));
  /** On one phone, player 2 sits at the far end and everything of theirs faces them. */
  const isFar = (p: PlayerId) => mode === 'local' && p === 1;
  const togglePowers = (p: PlayerId) => {
    setPowersOpen((open) => (p === 0 ? [!open[0], open[1]] : [open[0], !open[1]]));
    setBoostMsg(null);
  };
  /** Picking a power (or taking it back) closes the list. */
  const pickPower = (p: PlayerId, id: BoostId) => {
    if (toggleBoost(p, id)) setPowersOpen((open) => (p === 0 ? [false, open[1]] : [open[0], false]));
  };

  const winner = hud.phase === 'matchOver' ? matchWinner(hud) : hud.roundWinner;
  const loser = winner === null ? null : other(winner);
  const final = isFinalRound(hud);

  return (
    <main className="game">
      <header className="game-bar" ref={headerRef}>
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
        <button
          type="button"
          className="menu-btn"
          aria-expanded={menuOpen}
          aria-controls="game-menu"
          aria-label={menuOpen ? 'Close game menu' : 'Open game menu'}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
        <div id="game-menu" className={`game-actions${menuOpen ? ' is-open' : ''}`}>
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
            {muted ? 'Turn sound on' : 'Mute sound'}
          </button>
          <button type="button" className="btn btn-secondary btn-small" onClick={onExit}>
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
          onPointerCancel={(e) => endDrag(e.currentTarget)}
          onPointerLeave={() => {
            hoverRef.current = false;
          }}
        />

        {note && <p className="boost-note">{note}</p>}

        {inPlay &&
          seats.map((p) => (
            <Powers
              key={p}
              id={String(p)}
              far={isFar(p)}
              role={p === hud.turn ? 'attack' : 'defend'}
              title={p === hud.turn ? 'For your shot' : `Against ${names[hud.turn]}'s shot`}
              moving={hud.phase === 'moving'}
              chosen={chosenBoost(hud, p)}
              canUse={(id) => free[p] || (left[p]?.[id] ?? 0) > 0}
              open={powersOpen[p]}
              message={boostMsg?.player === p ? boostMsg.text : null}
              onToggle={() => togglePowers(p)}
              onPick={(id) => pickPower(p, id)}
            />
          ))}

        {banner && (
          <div className={`banner-layer${isFar(hud.turn) ? ' is-far' : ''}`} aria-hidden>
            <div key={banner.key} className="turn-banner">
              {banner.text}
            </div>
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
                {isFinalRound(hud) ? 'Start final round' : 'Start next round'}
              </button>
            </div>
          </div>
        )}

        {replay && (
          <div className="replay-bar" role="status">
            <span className="replay-tag">Replay</span>
            <span className="replay-text">
              {you(replay.winner) === 'You' ? 'Your' : `${names[replay.winner]}'s`} best shot {replay.shots.length > 1 ? `${replay.index + 1} of ${replay.shots.length}` : ''}:{' '}
              <strong>{SHOT_LABELS[replay.shots[replay.index].kind]}</strong>
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => {
                replayRef.current = null;
                setReplay(null);
              }}
            >
              Skip replay
            </button>
          </div>
        )}

        {hud.phase === 'matchOver' && !staked && winner !== null && !replay && (
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
                Go to menu
              </button>
            </div>
          </div>
        )}

        {staked && winner !== null && loser !== null && prize.step !== 'none' && prize.step !== 'breaking' && !replay && (
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

              {prize.step === 'choose' && !prize.swapping && (
                <>
                  <p>
                    What happens to the pen?
                    {!boxRoom[winner] &&
                      ` ${mode === 'local' ? `${names[winner]}'s` : 'Your'} pencil box is full (${MAX_PENS} pens), so keeping it means swapping one out.`}
                  </p>
                  <div className="prize-actions">
                    {boxRoom[winner] ? (
                      <button type="button" className="btn btn-primary" onClick={() => settle('take', true)} autoFocus>
                        Keep it in {mode === 'local' ? `${names[winner]}'s` : 'my'} pencil box
                      </button>
                    ) : (
                      <button type="button" className="btn btn-primary" onClick={() => setPrize({ step: 'choose', swapping: true })} autoFocus>
                        Swap it for one of mine
                      </button>
                    )}
                    <button type="button" className="btn btn-danger" onClick={() => setConfirmBreak(true)}>
                      Break it
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => settle('return', true)}>
                      Give it back
                    </button>
                  </div>
                  {confirmBreak && (
                    <div className="confirm" role="alertdialog" aria-labelledby="break-title" aria-describedby="break-note">
                      <p id="break-title" className="confirm-title">
                        Break {you(loser) === 'You' ? 'your' : `${names[loser]}'s`} {penModel(hud.loadouts[loser].model).name}?
                      </p>
                      <p id="break-note">It&apos;s gone for good: nobody gets it back.</p>
                      <button type="button" className="btn btn-secondary" onClick={() => setConfirmBreak(false)} autoFocus>
                        Keep the pen
                      </button>
                      <button type="button" className="btn btn-danger" onClick={() => settle('break', true)}>
                        Break the pen
                      </button>
                    </div>
                  )}
                </>
              )}

              {prize.step === 'choose' && prize.swapping && boxes[winner] && (
                <>
                  <PenBox
                    pens={boxes[winner]!}
                    selected={dropUid}
                    onSelect={(uid) => {
                      setDropUid(uid);
                      setSwapError(null);
                    }}
                    label="Throw away which pen?"
                  />
                  {swapError && (
                    <p className="error" role="alert">
                      {swapError}
                    </p>
                  )}
                  <div className="prize-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() =>
                        dropUid ? settle('swap', true) : setSwapError('Pick the pen to throw away, then swap.')
                      }
                    >
                      {dropUid
                        ? `Swap out ${penModel(boxes[winner]!.find((p) => p.uid === dropUid)?.model ?? hud.loadouts[winner].model).name}`
                        : 'Swap pens'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => setPrize({ step: 'choose', swapping: false })}>
                      Go back
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
                    Go to menu
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
                Go to menu
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

