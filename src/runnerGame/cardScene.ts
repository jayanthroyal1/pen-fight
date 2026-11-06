import { whileSeen } from '../platform/whileSeen';
import { drawFrame } from './draw';
import { WolfRig } from './rig';
import { WOLF_W, WOLF_X, jump, newRun, release, step, type Obstacle, type Run } from './sim';

/**
 * The real game playing itself, up close, for Wolf Run's card on the landing
 * page. The view is narrow so the wolf looks big, which leaves little sky, so
 * it takes short hops that only just clear what's in front of it.
 */

const STEP = 1 / 120;
export const CARD_VIEW = 300;
/** How far it runs before starting over, so it never reaches its top speed. */
export const LAP = 12_000;
const REST_S = 1.6;
/** Roughly how fast the wolf rises early in a jump. */
const RISE = 700;
/** How far over an obstacle the feet get before letting go: more for a long one, to stay up longer. */
const clearance = (o: Obstacle) => (o.w > 50 ? 40 : 10);

export const freshRun = (): Run => ({ ...newRun(), phase: 'running' });

/** One step of the wolf playing by itself. Returns true when it has just landed. */
export function autoStep(r: Run, rig: WolfRig | null, rng: () => number = Math.random, view = CARD_VIEW): boolean {
  const next = r.obstacles.find((o) => o.x + o.w > WOLF_X);
  if (next && next.lift === 0) {
    const over = next.h + clearance(next);
    // Leaves just late enough to reach that height as its nose gets there.
    const reach = next.x + 6 - (WOLF_X + WOLF_W - 6);
    if (r.y === 0 && reach / r.speed < over / RISE && jump(r)) rig?.jumped();
    if (r.y > over) release(r);
  }
  return step(r, STEP, view, rng);
}

/** Plays on `canvas` while it's on screen; if `still`, paints one frame of the wolf in mid-leap. Returns a way to stop. */
export function playCardScene(canvas: HTMLCanvasElement, still: boolean): () => void {
  const g = canvas.getContext('2d');
  if (!g) return () => {};
  let r = freshRun();
  const rig = new WolfRig();
  let time = 0;
  let spare = 0;
  let rest = 0;

  const paint = () => drawFrame(g, r, rig, canvas.width, canvas.height, CARD_VIEW, time);
  const advance = () => {
    rig.update(STEP, r, autoStep(r, rig));
    time += STEP;
  };

  const fit = () => {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * scale);
    canvas.height = Math.round(canvas.clientHeight * scale);
    paint();
  };
  const observer = new ResizeObserver(fit);
  observer.observe(canvas);

  if (still) {
    for (let i = 0; i < 6000 && !(r.y > 40 && r.vy > 0) && r.phase === 'running'; i++) advance();
    fit();
    return () => observer.disconnect();
  }

  const stopWatching = whileSeen(canvas, () => {
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (r.phase === 'running') {
        spare += dt;
        while (spare >= STEP && r.phase === 'running') {
          spare -= STEP;
          advance();
        }
        if (r.distance > LAP) {
          r = freshRun();
          rig.reset();
        }
      } else {
        rig.update(dt, r, false);
        rest += dt;
        if (rest > REST_S) {
          rest = 0;
          r = freshRun();
          rig.reset();
        }
      }
      paint();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  });
  return () => {
    stopWatching();
    observer.disconnect();
  };
}
