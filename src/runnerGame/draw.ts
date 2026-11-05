import type { Leg, Pose, WolfRig } from './rig';
import { WOLF_W, WOLF_X, type Obstacle, type Run } from './sim';

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

/** The coat: dark along the back, warm on the flanks, pale underneath. */
const FUR_BACK = '#4a382b';
const FUR_FLANK = '#8d6a48';
const FUR_WARM = '#b98a5c';
const FUR_BELLY = '#e2d2b6';
const FUR_FAR = '#3d2f25';

/** One leg: thick at the top, thin at the wrist, ending in a paw. */
function drawLeg(g: CanvasRenderingContext2D, leg: Leg): void {
  const color = leg.far ? FUR_FAR : leg.front ? FUR_FLANK : '#7a5a3e';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = color;
  g.lineWidth = leg.front ? 7.5 : 9.5;
  g.beginPath();
  g.moveTo(leg.hip.x, -leg.hip.y);
  g.lineTo(leg.knee.x, -leg.knee.y);
  g.stroke();
  g.lineWidth = 4.6;
  g.beginPath();
  g.moveTo(leg.knee.x, -leg.knee.y);
  g.lineTo(leg.foot.x, -leg.foot.y - 2);
  g.stroke();
  g.fillStyle = leg.far ? FUR_FAR : FUR_BELLY;
  g.beginPath();
  g.ellipse(leg.foot.x + 2, -leg.foot.y - 2, 4.4, 2.3, 0, 0, Math.PI * 2);
  g.fill();
}

function drawTail(g: CanvasRenderingContext2D, pose: Pose, lift: number): void {
  const t = pose.tail;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let i = 1; i < t.length; i++) {
    // Bushy in the middle, with a dark tip.
    const k = i / (t.length - 1);
    g.strokeStyle = k > 0.8 ? '#2a2019' : FUR_BACK;
    g.lineWidth = 5 + Math.sin(k * Math.PI) * 6;
    g.beginPath();
    g.moveTo(t[i - 1].x, -(t[i - 1].y - lift));
    g.lineTo(t[i].x, -(t[i].y - lift));
    g.stroke();
  }
}

function drawBody(g: CanvasRenderingContext2D, pose: Pose): void {
  const { hip, chest } = pose;
  const belly = Math.max(3, Math.min(hip.y, chest.y) - 17);
  const coat = g.createLinearGradient(0, -chest.y - 4, 0, -belly);
  coat.addColorStop(0, FUR_BACK);
  coat.addColorStop(0.42, FUR_FLANK);
  coat.addColorStop(0.72, FUR_WARM);
  coat.addColorStop(1, FUR_BELLY);
  g.fillStyle = coat;
  g.beginPath();
  g.moveTo(hip.x - 11, -hip.y + 7);
  g.quadraticCurveTo(hip.x - 8, -hip.y - 4, hip.x + 6, -hip.y - 3);
  g.quadraticCurveTo((hip.x + chest.x) / 2, -chest.y + 1, chest.x - 2, -chest.y - 5);
  g.quadraticCurveTo(chest.x + 13, -chest.y - 3, chest.x + 13, -chest.y + 9);
  g.quadraticCurveTo(chest.x + 9, -belly + 3, chest.x - 4, -belly + 1);
  // The waist tucks up towards the hind legs, as a lean running animal's does.
  g.quadraticCurveTo((hip.x + chest.x) / 2 - 4, -belly - 6, hip.x + 8, -belly - 2);
  g.quadraticCurveTo(hip.x - 8, -belly + 2, hip.x - 11, -hip.y + 7);
  g.closePath();
  g.fill();

  // Guard hairs along the back.
  g.fillStyle = '#35291f';
  for (let i = 0; i < 9; i++) {
    const k = i / 8;
    const x = hip.x + (chest.x - hip.x) * k;
    const y = -(hip.y + (chest.y - hip.y) * k) - 3;
    poly(g, [x - 3, y + 2, x - 6, y - 2.5, x + 2, y + 1], '#35291f');
  }
}

function drawHead(g: CanvasRenderingContext2D, pose: Pose): void {
  const { chest, head } = pose;
  // The neck ruff: the thick fur between the shoulders and the head.
  poly(g, [chest.x - 4, -chest.y - 4, head.x - 6, -head.y - 5, head.x + 2, -head.y + 8, chest.x + 11, -chest.y + 12, chest.x + 3, -chest.y + 15], FUR_FLANK);
  poly(g, [chest.x + 2, -chest.y + 2, head.x - 2, -head.y + 6, chest.x + 12, -chest.y + 13, chest.x + 4, -chest.y + 16], FUR_BELLY);

  g.save();
  g.translate(head.x, -head.y);
  g.rotate(pose.headTilt - pose.pitch * 0.45);
  const ear = pose.earFlick * 5;
  poly(g, [-7, -6, -9 - ear, -19, -1, -9], FUR_BACK);
  poly(g, [-1, -7, 0 - ear, -19, 6, -8], '#5c4633');
  poly(g, [0.5, -8, 0.6 - ear, -15, 4, -8.5], '#2a2019');
  // Skull and long muzzle.
  g.fillStyle = FUR_FLANK;
  g.beginPath();
  g.moveTo(-9, -3);
  g.quadraticCurveTo(-3, -11, 6, -8);
  g.quadraticCurveTo(12, -5, 25, -2);
  g.quadraticCurveTo(29, 0, 27, 2.5);
  g.quadraticCurveTo(14, 7, 3, 7);
  g.quadraticCurveTo(-7, 8, -9, -3);
  g.closePath();
  g.fill();
  // Pale cheek and jaw.
  g.fillStyle = FUR_BELLY;
  g.beginPath();
  g.moveTo(-7, 2);
  g.quadraticCurveTo(4, 0, 26, 1.5);
  g.quadraticCurveTo(14, 7.5, 3, 7.5);
  g.quadraticCurveTo(-4, 8, -7, 2);
  g.closePath();
  g.fill();
  // Nose, mouth line and an amber eye.
  g.fillStyle = '#14100c';
  g.beginPath();
  g.ellipse(26.4, -0.4, 2.8, 2.1, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#3a2c20';
  g.lineWidth = 0.9;
  g.beginPath();
  g.moveTo(25, 2.4);
  g.quadraticCurveTo(15, 4.6, 8, 3.4);
  g.stroke();
  poly(g, [4, -5, 10, -4.2, 5, -1.8], '#14100c');
  g.fillStyle = '#ffb31a';
  g.beginPath();
  g.ellipse(6.8, -3.9, 1.6, 1.1, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawDust(g: CanvasRenderingContext2D, rig: WolfRig): void {
  for (const d of rig.dust) {
    const left = 1 - d.age / d.life;
    g.globalAlpha = left * 0.4;
    g.fillStyle = '#9aa1ac';
    g.beginPath();
    g.arc(WOLF_X + WOLF_W / 2 + d.x, -d.y, d.size * (1.5 - left * 0.5), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function drawWolf(g: CanvasRenderingContext2D, r: Run, rig: WolfRig): void {
  const pose = rig.pose();
  const lift = r.phase === 'over' ? pose.y : r.y;
  // Soft shadow on the ground, shrinking as the wolf rises.
  const shadow = Math.max(0.25, 1 - lift / 170);
  g.fillStyle = 'rgba(0, 0, 0, 0.32)';
  g.beginPath();
  g.ellipse(WOLF_X + WOLF_W / 2 + pose.x, 3, 38 * shadow, 5 * shadow, 0, 0, Math.PI * 2);
  g.fill();

  g.save();
  g.translate(WOLF_X + WOLF_W / 2 + pose.x, -lift);
  if (pose.rotation) {
    g.translate(0, -22);
    g.rotate(pose.rotation);
    g.translate(0, 22);
  }
  // Springs: nose up on the rise, down on the fall, squashed on landing and stretched on take-off.
  g.translate(0, -24);
  g.rotate(-pose.pitch);
  g.translate(0, 24);
  g.scale(1 - pose.squash * 0.7, 1 + pose.squash);

  const [farHind, farFront, nearHind, nearFront] = pose.legs;
  drawLeg(g, farHind);
  drawLeg(g, farFront);
  drawTail(g, pose, r.y);
  drawBody(g, pose);
  drawLeg(g, nearHind);
  drawLeg(g, nearFront);
  drawHead(g, pose);
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
export function drawFrame(g: CanvasRenderingContext2D, r: Run, rig: WolfRig, w: number, h: number, viewW: number, time: number): void {
  const scale = w / viewW;
  // Where the ground sits: lower on a wide screen, higher on a tall one, leaving room to tap.
  const groundY = (h * (w > h ? 0.82 : 0.68)) / scale;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = SKY;
  g.fillRect(0, 0, w, h);
  // A crash or a heavy landing shakes the view.
  const shakeX = (Math.random() - 0.5) * rig.shake * scale;
  const shakeY = (Math.random() - 0.5) * rig.shake * scale;
  g.setTransform(scale, 0, 0, scale, shakeX, shakeY);

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
  drawDust(g, rig);
  drawWolf(g, r, rig);
  g.restore();
}
