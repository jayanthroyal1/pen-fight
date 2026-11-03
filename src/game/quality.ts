/**
 * Graphics quality. High adds ambient occlusion (soft contact shadows and
 * depth where pens meet the desk), multisampled edges and sharper rendering;
 * Low keeps phones cool and smooth. Auto picks by device.
 */
export type Quality = 'auto' | 'high' | 'low';
export type ResolvedQuality = 'high' | 'low';

const KEY = 'penfight:quality';

export const QUALITY_LABELS: Record<Quality, string> = {
  auto: 'Auto',
  high: 'High',
  low: 'Low',
};

export function savedQuality(): Quality {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'high' || v === 'low' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveQuality(q: Quality): void {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    // Remembering is only a convenience.
  }
}

/** Auto means High on computers and strong phones, Low on small or modest ones. */
export function resolveQuality(q: Quality = savedQuality()): ResolvedQuality {
  if (q !== 'auto') return q;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const modest = (nav.deviceMemory ?? 8) <= 4 || (nav.hardwareConcurrency ?? 8) <= 4;
  return touch && (modest || window.innerWidth < 900) ? 'low' : 'high';
}
