/** The lock-on camera's maths, kept apart from the engine so it can be tested. */

export interface Pillar {
  x: number;
  z: number;
  radius: number;
}

const MIN_DISTANCE = 4.2;
const MAX_DISTANCE = 9;
const NEAR_LIMIT = 1.6;
const CLEARANCE = 0.35;

/** How far back to sit, so both fighters and their swords fit. */
export const lockOnDistance = (gap: number, reach: number) => Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, 3.3 + gap * 0.85 + reach * 0.5));

/** Pulls the camera in from `want` metres if a pillar stands between it and the player. */
export function clearDistance(fromX: number, fromZ: number, dirX: number, dirZ: number, want: number, pillars: Pillar[]): number {
  let best = want;
  for (const p of pillars) {
    const toX = p.x - fromX;
    const toZ = p.z - fromZ;
    const along = toX * dirX + toZ * dirZ;
    if (along <= 0 || along > want) continue;
    const off = Math.hypot(toX - dirX * along, toZ - dirZ * along);
    const r = p.radius + CLEARANCE;
    if (off >= r) continue;
    best = Math.min(best, along - Math.sqrt(r * r - off * off));
  }
  return Math.max(NEAR_LIMIT, best);
}

/** Turns a joystick into a direction in the world: up on the stick is the way the camera faces. */
export function stickToWorld(stickX: number, stickY: number, camForwardX: number, camForwardZ: number): { x: number; z: number } {
  const rightX = camForwardZ;
  const rightZ = -camForwardX;
  return { x: rightX * stickX + camForwardX * stickY, z: rightZ * stickX + camForwardZ * stickY };
}

/** What a joystick drag means on a phone where the whole game has been turned on its side. */
export const unturn = (dx: number, dy: number, turned: boolean) => (turned ? { x: dy, y: -dx } : { x: dx, y: dy });

/** A frame's worth of fixed steps. A long gap, like coming back from another app, can't turn into a burst. */
export function stepsDue(spareMs: number, frameMs: number, stepMs: number): { steps: number; spareMs: number } {
  const total = spareMs + Math.min(frameMs, 100);
  const steps = Math.floor(total / stepMs);
  return { steps, spareMs: total - steps * stepMs };
}
