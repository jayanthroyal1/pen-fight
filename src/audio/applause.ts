/**
 * A classroom clapping: many people, each with their own clap rate, loudness,
 * pitch (hand size) and place in the room, joining in and dropping out at
 * slightly different times, with a little room echo. Rendered to raw samples
 * so it can be built once and replayed.
 */

export interface ApplauseOptions {
  seconds: number;
  clappers: number;
  rng?: () => number;
}

/** Left and right channels. */
export type Stereo = [Float32Array, Float32Array];

const CLAP_MS = 60;

export function renderApplause(sampleRate: number, opts: ApplauseOptions): Stereo {
  const { seconds, clappers, rng = Math.random } = opts;
  const length = Math.ceil(sampleRate * (seconds + 0.6));
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  const clapLen = Math.round((sampleRate * CLAP_MS) / 1000);
  const burst = new Float32Array(clapLen);

  for (let c = 0; c < clappers; c++) {
    // Who this person is: how fast, how loud, what their hands sound like, where they sit.
    const rate = 3.4 + rng() * 2.4;
    const loud = 0.35 + rng() * 0.65;
    const freq = 800 + rng() * 1600;
    const pan = rng();
    const panL = Math.cos((pan * Math.PI) / 2);
    const panR = Math.sin((pan * Math.PI) / 2);
    // Some start straight away, others a moment later; they stop one by one.
    const start = rng() * rng() * 0.45;
    const stop = seconds * (0.55 + rng() * 0.45);

    let t = start;
    while (t < stop) {
      // Claps get a little softer as each person tires.
      const tired = 1 - 0.5 * (t / stop);
      renderClap(burst, sampleRate, freq * (0.94 + rng() * 0.12), rng);
      const gain = loud * tired * (0.75 + rng() * 0.5);
      const at = Math.floor(t * sampleRate);
      for (let i = 0; i < clapLen && at + i < length; i++) {
        const s = burst[i] * gain;
        left[at + i] += s * panL;
        right[at + i] += s * panR;
      }
      t += (1 / rate) * (0.85 + rng() * 0.3);
    }
  }

  addRoom(left, sampleRate, 0);
  addRoom(right, sampleRate, 7);
  normalise(left, right, 0.9);
  return [left, right];
}

/** One clap: a couple of sharp skin slaps and a short burst of band-limited noise. */
function renderClap(out: Float32Array, sampleRate: number, freq: number, rng: () => number): void {
  // Band-pass biquad (RBJ cookbook) gives each pair of hands its own pitch.
  const q = 1.2 + rng() * 1.2;
  const w0 = (2 * Math.PI * freq) / sampleRate;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = alpha / a0;
  const b2 = -alpha / a0;
  const a1 = (-2 * Math.cos(w0)) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;

  const decay = (0.006 + rng() * 0.012) * sampleRate;
  const second = Math.floor((0.002 + rng() * 0.006) * sampleRate);
  for (let i = 0; i < out.length; i++) {
    const env = Math.exp(-i / decay) + (i >= second ? 0.6 * Math.exp(-(i - second) / decay) : 0);
    const x = (rng() * 2 - 1) * env;
    const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    out[i] = y * 4;
  }
}

/** Two short feedback echoes, like a classroom's hard walls. */
function addRoom(ch: Float32Array, sampleRate: number, skew: number): void {
  for (const [ms, fb] of [
    [29 + skew, 0.32],
    [47 + skew, 0.22],
  ]) {
    const d = Math.floor((sampleRate * ms) / 1000);
    for (let i = d; i < ch.length; i++) ch[i] += ch[i - d] * fb;
  }
}

function normalise(left: Float32Array, right: Float32Array, peak: number): void {
  let max = 0;
  for (let i = 0; i < left.length; i++) max = Math.max(max, Math.abs(left[i]), Math.abs(right[i]));
  if (max === 0) return;
  const k = peak / max;
  for (let i = 0; i < left.length; i++) {
    left[i] *= k;
    right[i] *= k;
  }
}
