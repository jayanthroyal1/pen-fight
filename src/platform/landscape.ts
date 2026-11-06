import { autoFullscreen } from './fullscreen';

/** Turns the phone's screen sideways where the browser allows it; a game's CSS rotates it where it doesn't. */
export function goLandscape(): void {
  autoFullscreen();
  const orientation = window.screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  // Full screen takes a moment to arrive, and locking needs it.
  window.setTimeout(() => void orientation.lock?.('landscape').catch(() => {}), 250);
}

export const leaveLandscape = () => window.screen.orientation?.unlock?.();
