/**
 * Pen fight sounds, synthesised with Web Audio so no files ship with the game:
 * a finger flick, plastic (or metal) pens clacking, taps on the wooden desk,
 * a pen sliding, a pen clattering on the floor after falling off, and the
 * class clapping for whoever wins.
 */

import { renderApplause, type ApplauseOptions } from './applause';

const MUTE_KEY = 'penfight:muted';

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
  muted = readMuted();

  /** Must run inside a user gesture the first time (browser autoplay rules). */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      this.noise = makeNoise(this.ctx);
      // Build the crowds now, off the moment of victory, so a win never stutters.
      window.setTimeout(() => this.applauseBuffer('round'), 0);
      window.setTimeout(() => this.applauseBuffer('match'), 50);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
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

  private tone(t: number, freq: number, dur: number, gain: number, endFreq = freq): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
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

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export const sounds = new SoundBoard();
