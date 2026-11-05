import { WOLF_X, type Obstacle, type Run } from './sim';
import { WOLF_PARTS } from './wolf';

const SKY = '#0f1115';
const FAR = '#181b21';
const NEAR = '#21252d';
const GROUND = '#2b3039';
const LINE = '#ff6a13';
const ROCK = '#4a505c';
const ROCK_LIT = '#6a7180';

/** A stable pseudo-random number for scenery, so hills don't change as they pass. */
const noise = (n: number) => {
  const v = Math.sin(n * 127.1) * 43758.5453;
  return v - Math.floor(v);
};

function poly(g: CanvasRenderingContext2D, points: number[], fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
  g.closePath();
  g.fill();
}

/** A line of jagged hills sliding past at `speed` of the wolf's pace. */
function hills(g: CanvasRenderingContext2D, viewW: number, base: number, height: number, distance: number, speed: number, fill: string, seed: number): void {
  const span = 120;
  const shift = distance * speed;
  const first = Math.floor(shift / span);
  const points = [-span, base + 4];
  for (let i = 0; i * span < viewW + span * 2; i++) {
    const n = first + i;
    points.push(i * span - (shift % span), base - height * (0.35 + 0.65 * noise(n + seed)));
  }
  points.push(viewW + span, base + 4);
  poly(g, points, fill);
}

function stars(g: CanvasRenderingContext2D, viewW: number, top: number, distance: number): void {
  g.fillStyle = '#9aa1ac';
  for (let i = 0; i < 46; i++) {
    const x = (noise(i) * (viewW + 40) - distance * 0.02 + 4000 * (viewW + 40)) % (viewW + 40);
    g.fillRect(x, top + noise(i + 99) * -top * 0.9 + top * 0.05, 2, 2);
  }
}

function drawWolf(g: CanvasRenderingContext2D, r: Run, time: number): void {
  g.save();
  // The drawing is 44 tall, feet at the bottom; world y runs up from the ground.
  g.translate(WOLF_X - 6, -r.y - 44);
  const inAir = r.y > 0;
  // Nose up on the way up, down on the way down.
  if (inAir) {
    g.translate(32, 24);
    g.rotate(Math.max(-0.3, Math.min(0.3, -r.vy / 2600)));
    g.translate(-32, -24);
  }
  const stride = Math.sin(time * (r.speed / 26));
  const legs = [
    [14, inAir ? -7 : stride * 7],
    [20, inAir ? -7 : -stride * 7],
    [34, inAir ? 7 : -stride * 7],
    [40, inAir ? 7 : stride * 7],
  ];
  for (const [i, [x, swing]] of legs.entries()) {
    poly(g, [x, 32, x + 6, 32, x + 3 + swing, 44, x - 1 + swing, 44], i % 2 === 0 ? '#c94f06' : '#ff6a13');
  }
  for (const part of WOLF_PARTS) poly(g, part.points, part.fill);
  g.restore();
}

function drawObstacle(g: CanvasRenderingContext2D, o: Obstacle, time: number): void {
  const top = -o.lift - o.h;
  if (o.kind === 'owl') {
    const flap = Math.sin(time * 14) * 9;
    const cx = o.x + o.w / 2;
    const cy = top + o.h / 2;
    poly(g, [cx - 8, cy, cx - o.w / 2 - 4, cy - flap, cx - 6, cy + 8], '#6a7180');
    poly(g, [cx + 8, cy, cx + o.w / 2 + 4, cy - flap, cx + 6, cy + 8], '#6a7180');
    poly(g, [cx - 10, cy - 12, cx - 6, cy - 16, cx, cy - 11, cx + 6, cy - 16, cx + 10, cy - 12, cx + 8, cy + 10, cx, cy + 14, cx - 8, cy + 10], '#c8ccd4');
    g.fillStyle = '#ffc21a';
    g.fillRect(cx - 7, cy - 7, 5, 5);
    g.fillRect(cx + 2, cy - 7, 5, 5);
    return;
  }
  const bumps = o.kind === 'ridge' ? 3 : 1;
  const w = o.w / bumps;
  for (let i = 0; i < bumps; i++) {
    const x = o.x + i * w;
    const h = o.h * (o.kind === 'ridge' && i === 1 ? 1 : 0.86);
    poly(g, [x, 0, x + w * 0.14, -h * 0.66, x + w * 0.46, -h, x + w * 0.86, -h * 0.72, x + w, 0], ROCK);
    poly(g, [x + w * 0.14, -h * 0.66, x + w * 0.46, -h, x + w * 0.5, -h * 0.2, x + w * 0.3, 0, x, 0], ROCK_LIT);
  }
}

/** Paints one frame. `w`, `h` in device pixels; `viewW` in world units. */
export function drawFrame(g: CanvasRenderingContext2D, r: Run, w: number, h: number, viewW: number, time: number): void {
  const scale = w / viewW;
  // Where the ground sits: lower on a wide screen, higher on a tall one, leaving room to tap.
  const groundY = (h * (w > h ? 0.82 : 0.68)) / scale;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = SKY;
  g.fillRect(0, 0, w, h);
  g.setTransform(scale, 0, 0, scale, 0, 0);

  stars(g, viewW, groundY, r.distance);
  g.fillStyle = '#f2f0ea';
  g.beginPath();
  g.arc(viewW * 0.78, groundY * 0.28, 26, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = SKY;
  g.beginPath();
  g.arc(viewW * 0.78 - 11, groundY * 0.28 - 5, 23, 0, Math.PI * 2);
  g.fill();

  hills(g, viewW, groundY, 170, r.distance, 0.12, FAR, 3);
  hills(g, viewW, groundY, 96, r.distance, 0.3, NEAR, 17);

  g.fillStyle = GROUND;
  g.fillRect(0, groundY, viewW, h / scale - groundY);
  g.fillStyle = LINE;
  g.fillRect(0, groundY, viewW, 3);
  // Ground marks rushing past give the sense of speed.
  g.fillStyle = '#3a404b';
  const mark = 90;
  for (let x = -(r.distance % mark); x < viewW; x += mark) g.fillRect(x, groundY + 16, 34, 3);

  g.save();
  g.translate(0, groundY);
  for (const o of r.obstacles) drawObstacle(g, o, time);
  drawWolf(g, r, r.phase === 'running' ? time : 0);
  g.restore();
}
