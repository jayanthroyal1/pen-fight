/**
 * Pen fight sounds, synthesised with Web Audio so no files ship with the game:
 * a finger flick, plastic (or metal) pens clacking, taps on the wooden desk,
 * a pen sliding, a pen clattering on the floor after falling off, and the
 * class clapping for whoever wins, the recorded classroom noise in the background,
 * and each hero power's own sounds.
 */

import { isAway, watchAudio } from '../platform/lifecycle';
import type { BoostId } from '../game/boosts';
import type { PowerId } from '../game/powers';
import { renderApplause, type ApplauseOptions } from './applause';
import { loadChatter, type NoisePreset } from './chatter';

const MUTE_KEY = 'penfight:muted';
const CHATTER_KEY = 'penfight:chatter';

export type Win = 'round' | 'match';

/** A quick round of claps for a round; a long ovation from the whole class for the match. */
const APPLAUSE: Record<Win, ApplauseOptions> = {
  round: { seconds: 3, clappers: 30 },
  match: { seconds: 5.5, clappers: 75 },
};

const MIN_GAP = { hit: 0.04, desk: 0.06 };

class SoundBoard {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private slideGain: GainNode | null = null;
  private last = { hit: 0, desk: 0 };
  private applauseBuffers: Partial<Record<Win, AudioBuffer>> = {};
  private applausePlaying: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private chatterGain: GainNode | null = null;
  private chatterSrcs: AudioBufferSourceNode[] = [];
  private chatterBuffers = new Map<NoisePreset, Promise<AudioBuffer[]>>();
  private wantChatter: NoisePreset | null = null;
  muted = readMuted();
  /** Classroom chatter volume, 0 (off) to 1; set by the player and remembered. */
  chatterVolume = readChatterVolume();

  /** Must run inside a user gesture the first time (browser autoplay rules). */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      watchAudio(this.ctx);
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this.noise = makeNoise(this.ctx);
      // Build the crowds now, off the moment of victory, so a win never stutters.
      window.setTimeout(() => this.applauseBuffer('round'), 0);
      window.setTimeout(() => this.applauseBuffer('match'), 50);
      // Chatter asked for before the first tap starts now.
      if (this.wantChatter) this.startChatter(this.wantChatter);
    }
    if (this.ctx.state === 'suspended' && !isAway()) void this.ctx.resume();
  }

  /** The class claps for a win: louder and longer for winning the match. */
  applause(win: Win): void {
    const a = this.audio();
    if (!a) return;
    const { ctx, t } = a;
    this.stopApplause();
    const src = ctx.createBufferSource();
    src.buffer = this.applauseBuffer(win);
    const gain = ctx.createGain();
    // Swells in over a moment, as people start clapping.
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(win === 'match' ? 0.85 : 0.6, t + 0.25);
    src.connect(gain).connect(this.master!);
    src.start(t);
    src.onended = () => {
      if (this.applausePlaying?.src === src) this.applausePlaying = null;
    };
    this.applausePlaying = { src, gain };
  }

  /** Fades out any clapping still going, e.g. when leaving the game. */
  stopApplause(): void {
    const playing = this.applausePlaying;
    if (!playing || !this.ctx) return;
    const t = this.ctx.currentTime;
    playing.gain.gain.cancelScheduledValues(t);
    playing.gain.gain.setTargetAtTime(0.0001, t, 0.15);
    playing.src.stop(t + 0.8);
    this.applausePlaying = null;
  }

  /** Starts the room's background chatter (if not already playing it). */
  startChatter(noise: NoisePreset): void {
    this.wantChatter = noise;
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    if (!this.chatterGain) {
      this.chatterGain = ctx.createGain();
      this.chatterGain.gain.value = this.chatterVolume * 0.7;
      this.chatterGain.connect(this.master);
    }
    let buffer = this.chatterBuffers.get(noise);
    if (!buffer) {
      buffer = loadChatter(ctx, noise);
      this.chatterBuffers.set(noise, buffer);
    }
    void buffer.then((layers) => {
      if (this.wantChatter !== noise || !this.chatterGain) return;
      this.chatterSrcs.forEach((s) => s.stop());
      // Each layer loops on its own; a recording and the synthesised chatter differ in length.
      this.chatterSrcs = layers.map((buf) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        src.connect(this.chatterGain!);
        src.start(ctx.currentTime, Math.random() * buf.duration);
        return src;
      });
    });
  }

  stopChatter(): void {
    this.wantChatter = null;
    this.chatterSrcs.forEach((s) => s.stop());
    this.chatterSrcs = [];
  }

  setChatterVolume(v: number): void {
    this.chatterVolume = Math.min(1, Math.max(0, v));
    try {
      localStorage.setItem(CHATTER_KEY, String(this.chatterVolume));
    } catch {
      // Remembering is only a convenience.
    }
    if (this.chatterGain && this.ctx) this.chatterGain.gain.setTargetAtTime(this.chatterVolume * 0.7, this.ctx.currentTime, 0.05);
  }

  /** A hero's sound: on its entrance, on each strike, and when it breaks a pen. */
  hero(power: PowerId, loud = 1): void {
    const a = this.audio();
    if (!a) return;
    const { t } = a;
    const g = 0.5 + loud * 0.5;
    switch (power) {
      case 'giant':
        // A deep boom with a rumble.
        this.tone(t, 90, 0.5, 0.9 * g, 38);
        this.noiseBurst(t, 0.5, 'lowpass', 220, 0.7, 0.8 * g);
        break;
      case 'webflick':
        // Thwip: a quick rising hiss.
        this.sweep(t, 900, 6000, 0.09, 0.6 * g);
        break;
      case 'comet':
        // Whoosh: falling, then fading.
        this.sweep(t, 3200, 380, 0.6, 0.55 * g);
        break;
      case 'nightwing':
        this.noiseBurst(t, 0.06, 'bandpass', 1400, 1.2, 0.8 * g);
        this.tone(t, 120, 0.18, 0.6 * g, 70);
        break;
      case 'amazon':
        // A bright chime with a rope swish.
        this.tone(t, 1320, 0.9, 0.2 * g);
        this.tone(t + 0.05, 1980, 0.7, 0.14 * g);
        this.sweep(t, 600, 2200, 0.3, 0.3 * g);
        break;
      case 'chakra':
        // A spinning whirr.
        this.tone(t, 160, 0.6, 0.25 * g, 520);
        this.sweep(t, 400, 2400, 0.6, 0.35 * g);
        break;
      case 'hanuman':
        // A temple bell: inharmonic partials with a long ring, and a low boom.
        for (const [f, gain, dur] of [
          [220, 0.35, 2.4],
          [330 * 1.02, 0.22, 1.9],
          [540, 0.16, 1.5],
          [880 * 0.99, 0.1, 1.1],
        ] as const) {
          this.tone(t, f, dur, gain * g);
        }
        this.tone(t, 70, 0.6, 0.7 * g, 40);
        break;
    }
  }

  /** A super power being armed: each has its own sound. */
  boost(id: BoostId): void {
    const a = this.audio();
    if (!a) return;
    const { t } = a;
    switch (id) {
      case 'lightning':
        // Crackling static that builds into a hum.
        for (let i = 0; i < 9; i++) this.noiseBurst(t + i * 0.035 + Math.random() * 0.02, 0.02, 'bandpass', 2500 + Math.random() * 3000, 3, 0.35);
        this.tone(t, 60, 0.5, 0.18, 120, 'sawtooth');
        break;
      case 'health':
        // A heartbeat, then a rising chime.
        this.tone(t, 70, 0.12, 0.6, 45);
        this.tone(t + 0.16, 65, 0.12, 0.45, 42);
        [523, 659, 784, 1047].forEach((f, i) => this.tone(t + 0.3 + i * 0.07, f, 0.5, 0.16, f, 'triangle'));
        break;
      case 'grip':
        // A heavy clunk and a latch.
        this.tone(t, 110, 0.25, 0.7, 55);
        this.noiseBurst(t, 0.05, 'lowpass', 600, 1, 0.6);
        this.noiseBurst(t + 0.12, 0.03, 'bandpass', 3200, 4, 0.45);
        this.tone(t + 0.12, 1800, 0.12, 0.08, 1800, 'square');
        break;
      case 'ice':
        // Glassy shimmer and a cold hiss.
        for (let i = 0; i < 7; i++) this.tone(t + i * 0.05, 2200 + Math.random() * 2600, 0.6, 0.06, undefined, 'sine');
        this.sweep(t, 7000, 1500, 0.8, 0.3);
        break;
      case 'strike':
        // Fire roaring up and a deep thump.
        this.sweep(t, 300, 2400, 0.45, 0.5);
        this.noiseBurst(t, 0.5, 'lowpass', 500, 0.7, 0.5);
        this.tone(t + 0.05, 80, 0.4, 0.7, 40);
        break;
      case 'tilt':
        // A wooden desk creaking as it tips.
        this.tone(t, 180, 0.7, 0.22, 95, 'sawtooth');
        this.noiseBurst(t, 0.6, 'bandpass', 420, 6, 0.35);
        this.tone(t + 0.5, 95, 0.15, 0.4, 60);
        break;
      case 'wall':
        // A force field powering up.
        this.tone(t, 110, 0.7, 0.25, 440, 'sawtooth');
        this.tone(t + 0.02, 220, 0.7, 0.12, 880, 'square');
        this.tone(t + 0.55, 880, 0.6, 0.12, 880, 'triangle');
        break;
      case 'double':
        [660, 990].forEach((f, i) => {
          this.tone(t + i * 0.14, f, 0.35, 0.2, f * 1.5, 'triangle');
          this.noiseBurst(t + i * 0.14, 0.04, 'highpass', 4000, 0.7, 0.2);
        });
        break;
    }
  }

  /** A lightning strike: a split-second crack and rolling thunder. */
  zap(): void {
    const a = this.audio();
    if (!a) return;
    const { t } = a;
    this.noiseBurst(t, 0.06, 'highpass', 1800, 0.7, 1);
    this.noiseBurst(t + 0.01, 0.12, 'bandpass', 900, 0.8, 0.8);
    this.noiseBurst(t + 0.05, 1.8, 'lowpass', 180, 0.6, 0.9);
    this.tone(t + 0.04, 55, 1.2, 0.6, 32);
  }

  /** A pen bouncing off the Force Wall. */
  wallHit(strength: number): void {
    const a = this.audio();
    if (!a) return;
    const { t } = a;
    const g = 0.2 + strength * 0.8;
    this.tone(t, 620, 0.35, 0.22 * g, 240, 'triangle');
    this.tone(t, 1240, 0.2, 0.08 * g, 480, 'sine');
    this.noiseBurst(t, 0.05, 'bandpass', 2400, 2, 0.3 * g);
  }

  /** Health Boost brings a fallen pen back. */
  saved(): void {
    const a = this.audio();
    if (!a) return;
    const { t } = a;
    [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(t + i * 0.06, f, 0.6, 0.15, f, 'triangle'));
    this.sweep(t, 800, 5000, 0.6, 0.2);
  }

  /** A pen snapping in half, and the pieces clattering. */
  snap(): void {
    const a = this.audio();
    if (!a) return;
    const { t } = a;
    this.noiseBurst(t, 0.03, 'highpass', 2500, 0.8, 1);
    this.noiseBurst(t + 0.01, 0.09, 'bandpass', 1800, 2, 0.7);
    this.tone(t, 260, 0.08, 0.5, 120);
    this.fall(false);
  }

  private sweep(t: number, from: number, to: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + dur * 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(env).connect(this.master!);
    src.start(t, Math.random() * 0.3, dur + 0.05);
  }

  private applauseBuffer(win: Win): AudioBuffer {
    const cached = this.applauseBuffers[win];
    if (cached) return cached;
    const ctx = this.ctx!;
    const [left, right] = renderApplause(ctx.sampleRate, APPLAUSE[win]);
    const buf = ctx.createBuffer(2, left.length, ctx.sampleRate);
    buf.copyToChannel(left, 0);
    buf.copyToChannel(right, 1);
    this.applauseBuffers[win] = buf;
    return buf;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Storage can be blocked; muting still works for this visit.
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.02);
  }

  /** The finger flicking the pen: a sharp snap and a low thock. `power` 0..1. */
  flick(power: number): void {
    const a = this.audio();
    if (!a) return;
    const { t } = a;
    const p = 0.35 + power * 0.65;
    this.noiseBurst(t, 0.012, 'bandpass', 3800, 1.4, 0.55 * p);
    this.tone(t, 190, 0.05, 0.5 * p, 110);
    this.noiseBurst(t + 0.004, 0.03, 'lowpass', 900, 0.7, 0.25 * p);
  }

  /** Two pens striking: a bright clack, ringing longer for a metal pen. */
  penHit(strength: number, metal: boolean): void {
    const a = this.audio();
    if (!a || a.t - this.last.hit < MIN_GAP.hit) return;
    this.last.hit = a.t;
    const { t } = a;
    const g = 0.15 + strength * 0.85;
    const detune = 1 + (Math.random() - 0.5) * 0.16;
    this.noiseBurst(t, 0.018, 'bandpass', 2600 * detune, 6, 0.9 * g);
    this.noiseBurst(t + 0.006, 0.012, 'highpass', 5000, 0.8, 0.35 * g);
    if (metal) {
      this.tone(t, 3150 * detune, 0.22, 0.12 * g);
      this.tone(t, 4730 * detune, 0.15, 0.06 * g);
    } else {
      this.tone(t, 1750 * detune, 0.06, 0.18 * g);
    }
  }

  /** A pen landing or bumping on the wooden desk. */
  deskTap(strength: number): void {
    const a = this.audio();
    if (!a || a.t - this.last.desk < MIN_GAP.desk) return;
    this.last.desk = a.t;
    const { t } = a;
    const g = 0.1 + strength * 0.7;
    this.tone(t, 150, 0.07, 0.6 * g, 95);
    this.noiseBurst(t, 0.03, 'bandpass', 1100, 1.5, 0.45 * g);
  }

  /** A pen dropping off the desk and clattering on the floor below. */
  fall(metal: boolean): void {
    const a = this.audio();
    if (!a) return;
    const { t } = a;
    [0.28, 0.4, 0.47, 0.52].forEach((dt, i) => {
      const g = 0.7 / (i + 1);
      this.noiseBurst(t + dt, 0.025, 'bandpass', metal ? 3000 : 1900, 4, g);
      this.tone(t + dt, 130, 0.06, 0.4 * g, 80);
    });
  }

  /** Continuous scrape while pens slide; `speed` 0..1, call every frame. */
  slide(speed: number): void {
    const a = this.audio();
    if (!a) return;
    const { ctx, t } = a;
    if (!this.slideGain) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 700;
      filter.Q.value = 0.8;
      this.slideGain = ctx.createGain();
      this.slideGain.gain.value = 0;
      src.connect(filter).connect(this.slideGain).connect(this.master!);
      src.start();
    }
    this.slideGain.gain.setTargetAtTime(Math.min(1, speed) * 0.09, t, 0.05);
  }

  private audio(): { ctx: AudioContext; t: number } | null {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return null;
    return { ctx: this.ctx, t: this.ctx.currentTime };
  }

  private noiseBurst(
    t: number,
    dur: number,
    type: BiquadFilterType,
    freq: number,
    q: number,
    gain: number,
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(env).connect(this.master!);
    src.start(t, Math.random() * 0.5, dur + 0.01);
  }

  private tone(t: number, freq: number, dur: number, gain: number, endFreq = freq, type: OscillatorType = 'sine'): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function readChatterVolume(): number {
  try {
    const v = Number(localStorage.getItem(CHATTER_KEY));
    return localStorage.getItem(CHATTER_KEY) === null || Number.isNaN(v) ? 0.6 : Math.min(1, Math.max(0, v));
  } catch {
    return 0.6;
  }
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export const sounds = new SoundBoard();
