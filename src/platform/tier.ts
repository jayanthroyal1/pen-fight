/** How much 3D a device gets; `off` means the plain CSS background. Kept apart from the stage so checking it doesn't load three.js. */
export type Tier = 'high' | 'low' | 'off';

/** Reads what the device and the player's settings allow. */
export function stageTier(): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  // `?stage=off`: the light version without 3D, as slow or older phones get it.
  if (new URLSearchParams(location.search).get('stage') === 'off') return 'off';
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || nav.connection?.saveData) return 'off';
  const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const modest = (nav.deviceMemory ?? 8) <= 4 || (nav.hardwareConcurrency ?? 8) <= 4;
  return touch || modest ? 'low' : 'high';
}

/** Files in `public/`, wherever the site is hosted. */
export const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
