import type { RoomTheme } from '../game/rooms';

/**
 * Classroom chatter, synthesised: a crowd of children talking at once.
 * Each voice is a pitched source shaped by moving vowel formants, in syllables
 * and phrases. Telugu chatter is fast and syllable-timed with open vowels;
 * English is stress-timed with more hissing consonants. Real recordings dropped
 * in `public/audio/class-<noise>.mp3` replace the synthesised chatter.
 */

export type NoisePreset = RoomTheme['noise'];

interface Preset {
  voices: number;
  /** Share of voices speaking Telugu (the rest English). */
  telugu: number;
  /** Overall loudness of the talking. */
  level: number;
  laughs: number;
  bangs: number;
  hum: 'fan' | 'ac' | 'none';
}

const PRESETS: Record<NoisePreset, Preset> = {
  public: { voices: 16, telugu: 1, level: 1, laughs: 6, bangs: 5, hum: 'fan' },
  private: { voices: 12, telugu: 0.55, level: 0.8, laughs: 4, bangs: 2, hum: 'fan' },
  cbse: { voices: 9, telugu: 0, level: 0.6, laughs: 3, bangs: 1, hum: 'none' },
  international: { voices: 5, telugu: 0, level: 0.4, laughs: 2, bangs: 0, hum: 'ac' },
};

const LOOP_SECONDS = 16;

/** Vowel formants (Hz) for an adult; children's are scaled up. */
const VOWELS: Record<string, [number, number, number]> = {
  a: [800, 1250, 2600],
  aa: [850, 1200, 2550],
  e: [500, 1900, 2600],
  i: [320, 2300, 3000],
  o: [520, 900, 2450],
  u: [360, 850, 2300],
};
const TELUGU_VOWELS = ['a', 'aa', 'a', 'u', 'i', 'e', 'o', 'aa'];
const ENGLISH_VOWELS = ['a', 'e', 'i', 'o', 'u', 'e', 'i'];

/**
 * The sounds to loop for a room's chatter. A recording is used when there is
 * one: `public/audio/class-<noise>.mp3` for that room, or `public/audio/class.mp3`
 * for every room. Rooms whose children talk Telugu also get synthesised Telugu
 * chatter mixed under it (a generic recording won't be in Telugu). With no
 * recording, the chatter is synthesised.
 */
export async function loadChatter(ctx: BaseAudioContext, noise: NoisePreset): Promise<AudioBuffer[]> {
  const recording = (await fetchAudio(ctx, `class-${noise}.mp3`)) ?? (await fetchAudio(ctx, 'class.mp3'));
  if (!recording) return [await renderChatter(ctx.sampleRate, noise)];
  return PRESETS[noise].telugu > 0 ? [recording, await renderChatter(ctx.sampleRate, noise, 0.55)] : [recording];
}

async function fetchAudio(ctx: BaseAudioContext, file: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}audio/${file}`);
    // A dev server answers missing files with the app page, so check it's really audio.
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('audio')) return null;
    return await ctx.decodeAudioData(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** Synthesised chatter for a room; `gain` scales it, e.g. when mixed under a recording. */
export async function renderChatter(sampleRate: number, noise: NoisePreset, gain = 1): Promise<AudioBuffer> {
  const preset = PRESETS[noise];
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * LOOP_SECONDS), sampleRate);
  const noiseBuf = whiteNoise(ctx, 2);

  // A room: short reverb so voices sound like they're in a hall of hard walls.
  const reverb = ctx.createConvolver();
  reverb.buffer = roomImpulse(ctx, 0.7);
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  const dry = ctx.createGain();
  dry.gain.value = 0.8;
  const bus = ctx.createGain();
  bus.gain.value = 0.5 * preset.level * gain;
  bus.connect(dry).connect(ctx.destination);
  bus.connect(reverb).connect(wet).connect(ctx.destination);

  for (let v = 0; v < preset.voices; v++) {
    const telugu = Math.random() < preset.telugu;
    voice(ctx, bus, noiseBuf, telugu, v);
  }
  for (let i = 0; i < preset.laughs; i++) laugh(ctx, bus, noiseBuf, Math.random() * (LOOP_SECONDS - 2));
  for (let i = 0; i < preset.bangs; i++) bang(ctx, bus, noiseBuf, Math.random() * (LOOP_SECONDS - 1));
  if (preset.hum !== 'none') hum(ctx, preset.hum, noiseBuf);

  const out = await ctx.startRendering();
  fadeEdges(out, 0.25);
  return out;
}

/** One child (or now and then a teacher) talking in phrases, panned somewhere in the room. */
function voice(ctx: OfflineAudioContext, bus: AudioNode, noiseBuf: AudioBuffer, telugu: boolean, seat: number): void {
  const adult = Math.random() < 0.08;
  const f0 = adult ? 130 + Math.random() * 60 : 230 + Math.random() * 110;
  const scale = adult ? 1 : 1.18;
  const distance = 0.25 + Math.random() * 0.75;

  const src = ctx.createOscillator();
  src.type = 'sawtooth';
  const formants = [0, 1, 2].map((i) => {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = [6, 9, 12][i];
    return f;
  });
  const fGains = [1, 0.55, 0.25].map((g) => {
    const n = ctx.createGain();
    n.gain.value = g;
    return n;
  });
  const amp = ctx.createGain();
  amp.gain.value = 0;
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.sin(seat * 2.39) * 0.9;
  const level = ctx.createGain();
  level.gain.value = (0.18 / distance) * (adult ? 1.2 : 1);
  formants.forEach((f, i) => src.connect(f).connect(fGains[i]).connect(amp));
  amp.connect(pan).connect(level).connect(bus);

  // Hiss for consonants: s, sh, t, k.
  const hiss = ctx.createBufferSource();
  hiss.buffer = noiseBuf;
  hiss.loop = true;
  const hissFilter = ctx.createBiquadFilter();
  hissFilter.type = 'highpass';
  hissFilter.frequency.value = telugu ? 2500 : 4200;
  const hissAmp = ctx.createGain();
  hissAmp.gain.value = 0;
  hiss.connect(hissFilter).connect(hissAmp).connect(pan);

  const syllable = telugu ? 0.13 : 0.18;
  let t = Math.random() * 2;
  while (t < LOOP_SECONDS - 0.5) {
    // A phrase: a few words, pitch rising or falling towards the end.
    const words = 2 + Math.floor(Math.random() * 5);
    const rising = Math.random() < (telugu ? 0.5 : 0.3);
    for (let w = 0; w < words && t < LOOP_SECONDS - 0.4; w++) {
      const syllables = telugu ? 2 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 3);
      for (let s = 0; s < syllables; s++) {
        const dur = syllable * (0.7 + Math.random() * 0.6);
        const vowels = telugu ? TELUGU_VOWELS : ENGLISH_VOWELS;
        const [f1, f2, f3] = VOWELS[vowels[Math.floor(Math.random() * vowels.length)]];
        formants[0].frequency.setTargetAtTime(f1 * scale, t, 0.02);
        formants[1].frequency.setTargetAtTime(f2 * scale, t, 0.02);
        formants[2].frequency.setTargetAtTime(f3 * scale, t, 0.02);
        const phraseK = (w + s / syllables) / words;
        const pitch = f0 * (1 + (rising ? 0.25 : -0.15) * phraseK + (Math.random() - 0.5) * 0.12);
        src.frequency.setTargetAtTime(pitch, t, 0.03);
        // English stresses some syllables; Telugu keeps them even.
        const stress = telugu ? 0.85 + Math.random() * 0.2 : s === 0 ? 1.1 : 0.55 + Math.random() * 0.3;
        // Consonant first: a short hiss or a stop.
        if (Math.random() < (telugu ? 0.35 : 0.55)) {
          hissAmp.gain.setValueAtTime(0, t);
          hissAmp.gain.linearRampToValueAtTime(0.25 * stress, t + 0.012);
          hissAmp.gain.linearRampToValueAtTime(0, t + 0.04 + Math.random() * 0.04);
          t += 0.03;
        }
        amp.gain.setTargetAtTime(stress, t, 0.015);
        amp.gain.setTargetAtTime(0, t + dur * 0.8, 0.02);
        t += dur;
      }
      t += 0.04 + Math.random() * 0.09;
    }
    t += 0.3 + Math.random() * 1.4;
  }
  src.start(0);
  hiss.start(0);
}

/** A burst of "ha-ha-ha": quick, high, breathy pulses. */
function laugh(ctx: OfflineAudioContext, bus: AudioNode, noiseBuf: AudioBuffer, at: number): void {
  const src = ctx.createOscillator();
  src.type = 'sawtooth';
  src.frequency.value = 300 + Math.random() * 120;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 950;
  f.Q.value = 3;
  const breath = ctx.createBufferSource();
  breath.buffer = noiseBuf;
  const bf = ctx.createBiquadFilter();
  bf.type = 'bandpass';
  bf.frequency.value = 1500;
  const amp = ctx.createGain();
  amp.gain.value = 0;
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  src.connect(f).connect(amp);
  breath.connect(bf).connect(amp);
  amp.connect(pan).connect(bus);
  const pulses = 4 + Math.floor(Math.random() * 5);
  for (let i = 0; i < pulses; i++) {
    const t = at + i * (0.15 + Math.random() * 0.04);
    src.frequency.setValueAtTime((300 + Math.random() * 140) * (1 - i * 0.03), t);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.32 * (1 - i / (pulses + 2)), t + 0.02);
    amp.gain.linearRampToValueAtTime(0, t + 0.11);
  }
  src.start(at);
  breath.start(at);
  src.stop(at + pulses * 0.2 + 0.2);
  breath.stop(at + pulses * 0.2 + 0.2);
}

/** A hand slapped on a desk or a bench dragged. */
function bang(ctx: OfflineAudioContext, bus: AudioNode, noiseBuf: AudioBuffer, at: number): void {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 700;
  const amp = ctx.createGain();
  const scrape = Math.random() < 0.4;
  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(scrape ? 0.15 : 0.5, at + 0.005);
  amp.gain.exponentialRampToValueAtTime(0.001, at + (scrape ? 0.6 : 0.15));
  n.connect(f).connect(amp).connect(bus);
  n.start(at);
  n.stop(at + 0.7);
}

/** A ceiling fan's whoosh, or the steady hush of air-conditioning. */
function hum(ctx: OfflineAudioContext, kind: 'fan' | 'ac', noiseBuf: AudioBuffer): void {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf;
  n.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = kind === 'fan' ? 380 : 900;
  const amp = ctx.createGain();
  amp.gain.value = kind === 'fan' ? 0.09 : 0.05;
  if (kind === 'fan') {
    // Blades sweeping past, about twice a second.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 2.2;
    const depth = ctx.createGain();
    depth.gain.value = 0.04;
    lfo.connect(depth).connect(amp.gain);
    lfo.start(0);
  }
  n.connect(f).connect(amp).connect(ctx.destination);
  n.start(0);
}

function whiteNoise(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function roomImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.ceil(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp((-4 * i) / len);
  }
  return buf;
}

/** Short fades at both ends so the loop has no click where it wraps round. */
function fadeEdges(buf: AudioBuffer, seconds: number): void {
  const n = Math.floor(buf.sampleRate * seconds);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      d[i] *= k;
      d[d.length - 1 - i] *= k;
    }
  }
}
