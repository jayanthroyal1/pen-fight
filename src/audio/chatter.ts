import type { RoomTheme } from '../game/rooms';

/**
 * Classroom background noise, from recordings: `public/audio/class-<noise>.mp3`
 * for one room, or `public/audio/class.mp3` for every room.
 */

export type NoisePreset = RoomTheme['noise'];

/** The sounds to loop for a room's background noise; none when there's no recording. */
export async function loadChatter(ctx: BaseAudioContext, noise: NoisePreset): Promise<AudioBuffer[]> {
  const recording = (await fetchAudio(ctx, `class-${noise}.mp3`)) ?? (await fetchAudio(ctx, 'class.mp3'));
  return recording ? [recording] : [];
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
