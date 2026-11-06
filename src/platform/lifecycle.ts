/**
 * Knows when the player has stepped away: the app is in the background, the
 * phone is locked, something like a call screen has taken over, or the system
 * has cut off the sound. While they're away all sound stops and games hold still,
 * and everything comes back by itself when they return.
 *
 * Sound is stopped by pausing it, never by muting it, so a player who had it on
 * gets it back and one who had it off doesn't.
 */

type StateListener = (away: boolean) => void;

/** How often to try for the sound again while the system is holding it, as it does during a call. */
const RETRY_MS = 1000;

const contexts = new Set<AudioContext>();
const listeners = new Set<StateListener>();
let hidden = false;
/** A touch device lost focus to something on top of it. */
let covered = false;
/** The system took the sound away. */
let interrupted = false;
let away = false;
let retry = 0;

const touch = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;

export const isAway = () => away;

/** Calls `listener` whenever the player leaves or comes back. Returns a way to stop. */
export function onAwayChange(listener: StateListener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Resolves as soon as the player is here. */
export function whenHere(): Promise<void> {
  if (!away) return Promise.resolve();
  return new Promise((resolve) => {
    const stop = onAwayChange((gone) => {
      if (gone) return;
      stop();
      resolve();
    });
  });
}

function resumeAll(): void {
  contexts.forEach((ctx) => {
    if (ctx.state !== 'running') void ctx.resume().catch(() => {});
  });
}

function suspendAll(): void {
  contexts.forEach((ctx) => {
    if (ctx.state === 'running') void ctx.suspend().catch(() => {});
  });
}

function retrySound(): void {
  window.clearInterval(retry);
  retry = 0;
  if (!interrupted || hidden) return;
  retry = window.setInterval(resumeAll, RETRY_MS);
}

function update(): void {
  const next = hidden || covered || interrupted;
  retrySound();
  if (next === away) return;
  away = next;
  if (away) {
    if (!interrupted) suspendAll();
  } else {
    resumeAll();
  }
  listeners.forEach((f) => f(away));
}

/** Puts a sound engine's context under this watch. */
export function watchAudio(ctx: AudioContext): void {
  contexts.add(ctx);
  if (away) void ctx.suspend().catch(() => {});
  let wasRunning = ctx.state === 'running';
  ctx.addEventListener('statechange', () => {
    const state = ctx.state as string;
    if (state === 'running') {
      wasRunning = true;
      if (interrupted) {
        interrupted = false;
        update();
      }
      return;
    }
    // Stopped, and not by us: on iPhones this is how a call shows up.
    if (state === 'interrupted' || (state === 'suspended' && wasRunning && !away)) {
      interrupted = true;
      update();
    }
    wasRunning = false;
  });
}

if (typeof window !== 'undefined') {
  hidden = document.visibilityState === 'hidden';
  away = hidden;
  const here = () => {
    covered = false;
    update();
  };
  document.addEventListener('visibilitychange', () => {
    hidden = document.visibilityState === 'hidden';
    if (!hidden) covered = false;
    update();
  });
  window.addEventListener('pagehide', () => {
    hidden = true;
    update();
  });
  window.addEventListener('pageshow', () => {
    hidden = document.visibilityState === 'hidden';
    update();
  });
  window.addEventListener('blur', () => {
    if (!touch()) return;
    covered = true;
    update();
  });
  window.addEventListener('focus', here);
  // A touch means they're here, whatever else was reported. Sound that couldn't restart by itself may now.
  window.addEventListener(
    'pointerdown',
    () => {
      if (covered) here();
      if (!away) resumeAll();
    },
    { capture: true, passive: true },
  );

  // Newer iPhones also report it directly.
  const session = (navigator as Navigator & { audioSession?: EventTarget & { state?: string } }).audioSession;
  session?.addEventListener?.('statechange', () => {
    interrupted = session.state === 'interrupted';
    update();
    if (!interrupted) resumeAll();
  });
}
