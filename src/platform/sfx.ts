/**
 * The platform's sounds, synthesised with Web Audio so nothing extra downloads:
 * the logo stinger, interface ticks, whooshes and a low ambient hum. Browsers
 * only allow sound after a tap, so `unlock` runs on the first one. Mute is shared
 * with the games.
 */

const MUTE_KEY = 'penfight:muted';
const VOLUME = 0.8;

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

class PlatformSfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private hum: { gain: GainNode; stop: () => void } | null = null;
  private lastHover = 0;
  muted = readMuted();

  /** Must run inside a tap or key press the first time. */
  unlock(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : VOLUME;
      this.master.connect(this.ctx.destination);
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // Storage can be blocked; muting still works for this visit.
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : VOLUME, this.ctx.currentTime, 0.03);
  }

  /** Whether a sound played now would be heard: a tap has unlocked audio. */
  canPlay(): boolean {
    return this.ctx?.state === 'running';
  }

  private now(): number | null {
    return this.ctx && this.master && this.ctx.state === 'running' ? this.ctx.currentTime : null;
  }

  private tone(t: number, type: OscillatorType, from: number, to: number, dur: number, gain: number, out?: AudioNode): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur / 4));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(out ?? this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private sweep(t: number, from: number, to: number, dur: number, gain: number, q = 1.5): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + dur * 0.5);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(env).connect(this.master!);
    src.start(t);
    src.stop(t + dur + 0.03);
  }

  /** The logo's sound: a rising rush, a deep hit, a power chord and a wolf's howl. */
  stinger(): void {
    const t = this.now();
    if (t === null) return;
    const ctx = this.ctx!;
    this.sweep(t, 200, 5200, 0.55, 0.5);
    const hit = t + 0.42;
    this.tone(hit, 'sine', 110, 30, 1.5, 0.95);
    this.sweep(hit, 1800, 120, 0.9, 0.55, 0.7);

    const echo = ctx.createDelay(0.6);
    echo.delayTime.value = 0.27;
    const fade = ctx.createGain();
    fade.gain.value = 0.38;
    const wet = ctx.createGain();
    wet.gain.value = 0.6;
    echo.connect(fade).connect(echo);
    echo.connect(wet).connect(this.master!);

    const chord = ctx.createBiquadFilter();
    chord.type = 'lowpass';
    chord.Q.value = 3;
    chord.frequency.setValueAtTime(260, hit);
    chord.frequency.exponentialRampToValueAtTime(2600, hit + 0.5);
    chord.frequency.exponentialRampToValueAtTime(420, hit + 2);
    chord.connect(this.master!);
    chord.connect(echo);
    for (const f of [55, 82.4, 110, 165]) {
      this.tone(hit, 'sawtooth', f, f, 2.1, 0.11, chord);
      this.tone(hit, 'sawtooth', f * 1.006, f * 1.006, 2.1, 0.08, chord);
    }

    // The howl: a slow rise, a wobble at the top, and a falling tail.
    const howl = ctx.createOscillator();
    howl.type = 'triangle';
    const at = hit + 0.25;
    howl.frequency.setValueAtTime(320, at);
    howl.frequency.exponentialRampToValueAtTime(690, at + 0.55);
    howl.frequency.setValueAtTime(690, at + 0.95);
    howl.frequency.exponentialRampToValueAtTime(410, at + 1.7);
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 5.5;
    const depth = ctx.createGain();
    depth.gain.value = 9;
    wobble.connect(depth).connect(howl.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(0.13, at + 0.35);
    env.gain.setValueAtTime(0.13, at + 1);
    env.gain.exponentialRampToValueAtTime(0.0001, at + 1.75);
    howl.connect(env);
    env.connect(this.master!);
    env.connect(echo);
    howl.start(at);
    wobble.start(at);
    howl.stop(at + 1.8);
    wobble.stop(at + 1.8);
  }

  /** Flying through the logo into the platform. */
  warp(): void {
    const t = this.now();
    if (t === null) return;
    this.sweep(t, 320, 6000, 0.9, 0.5);
    this.tone(t, 'sine', 70, 220, 0.8, 0.35);
  }

  /** A pointer moving onto something; never for touch. */
  hover(): void {
    const t = this.now();
    if (t === null || t - this.lastHover < 0.05) return;
    this.lastHover = t;
    this.tone(t, 'triangle', 1500, 1900, 0.05, 0.05);
  }

  tap(): void {
    const t = this.now();
    if (t === null) return;
    this.tone(t, 'square', 520, 780, 0.07, 0.07);
    this.tone(t + 0.04, 'triangle', 1040, 1040, 0.09, 0.08);
  }

  back(): void {
    const t = this.now();
    if (t === null) return;
    this.tone(t, 'square', 620, 340, 0.1, 0.06);
  }

  /** Opening a genre. */
  open(): void {
    const t = this.now();
    if (t === null) return;
    this.sweep(t, 500, 2600, 0.3, 0.3);
    this.tone(t + 0.04, 'triangle', 440, 880, 0.2, 0.12);
  }

  /** Starting a game. */
  launch(): void {
    const t = this.now();
    if (t === null) return;
    this.sweep(t, 240, 7000, 0.7, 0.55);
    [392, 523, 659, 784].forEach((f, i) => this.tone(t + i * 0.06, 'sawtooth', f, f, 0.26, 0.07));
    this.tone(t + 0.3, 'sine', 90, 40, 0.5, 0.7);
  }

  /** A quiet two-note drone behind the menus. */
  startHum(): void {
    const t = this.now();
    if (t === null || this.hum) return;
    const ctx = this.ctx!;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 2.5);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 340;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const depth = ctx.createGain();
    depth.gain.value = 130;
    lfo.connect(depth).connect(filter.frequency);
    const oscs = [55, 55.4, 82.6].map((f) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(filter);
      o.start(t);
      return o;
    });
    filter.connect(gain).connect(this.master!);
    lfo.start(t);
    this.hum = {
      gain,
      stop: () => {
        [...oscs, lfo].forEach((o) => o.stop(ctx.currentTime + 0.7));
      },
    };
  }

  stopHum(): void {
    if (!this.hum || !this.ctx) return;
    this.hum.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.15);
    this.hum.stop();
    this.hum = null;
  }
}

export const sfx = new PlatformSfx();

/** A short vibration on phones that support it. */
export function buzz(ms: number): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Some browsers block vibration until the page has been interacted with.
  }
}
