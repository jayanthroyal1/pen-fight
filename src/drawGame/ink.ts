/** The drawing, as data small enough to send: strokes on a 1000 × 750 sheet. */

export const SHEET_W = 1000;
export const SHEET_H = 750;

export interface Stroke {
  id: string;
  color: string;
  width: number;
  /** x, y, x, y… */
  points: number[];
  /** How wide the line is at each point, as a percentage of `width`. Without it, the line is even. */
  press?: number[];
  /** A flood of colour starting at the one point. */
  fill?: boolean;
}

/** One change to the drawing: more of a stroke, a fill, the last stroke back or gone, or a clean sheet. */
export type InkOp =
  | { k: 'add'; id: string; color: string; width: number; points: number[]; press?: number[] }
  | { k: 'fill'; id: string; color: string; x: number; y: number }
  | { k: 'put'; stroke: Stroke }
  | { k: 'undo' }
  | { k: 'clear' };

export function applyInk(strokes: Stroke[], op: InkOp): Stroke[] {
  if (op.k === 'clear') return [];
  if (op.k === 'undo') return strokes.slice(0, -1);
  if (op.k === 'put') return [...strokes, op.stroke];
  if (op.k === 'fill') return [...strokes, { id: op.id, color: op.color, width: 0, points: [op.x, op.y], fill: true }];
  const last = strokes[strokes.length - 1];
  if (last?.id === op.id) {
    const press = last.press && op.press ? [...last.press, ...op.press] : last.press;
    return [...strokes.slice(0, -1), { ...last, points: [...last.points, ...op.points], press }];
  }
  return [...strokes, { id: op.id, color: op.color, width: op.width, points: op.points, press: op.press }];
}

/** Below this much movement a finger or mouse is only trembling. */
const MIN_STEP = 1.4;
/** How firmly the line follows the pointer when slow, and when fast: slow lines get steadied, fast ones stay close. */
const FOLLOW_SLOW = 0.3;
const FOLLOW_FAST = 0.85;
/** The speed, in sheet units per millisecond, counted as fast. */
const FAST = 2.4;
const THIN = 0.5;
const THICK = 1.15;

/**
 * The feel of the brush. The tip trails the pointer on a short spring, which
 * takes out the shake of a finger, and ink thins as it speeds up as a real
 * marker's does. A stylus decides the width by how hard it presses instead.
 */
export class Brush {
  private x: number;
  private y: number;
  private t: number;
  private speed = 0;
  private width = 0.75;

  constructor(
    x: number,
    y: number,
    t: number,
    /** An even line, for the eraser. */
    private readonly steady = false,
  ) {
    this.x = x;
    this.y = y;
    this.t = t;
  }

  /** The stroke's first point: a little thin, so lines start with a taper. */
  start(): { points: number[]; press: number[] } {
    return { points: [Math.round(this.x), Math.round(this.y)], press: [this.steady ? 100 : 60] };
  }

  private ink(pressure: number): number {
    if (this.steady) return 1;
    const target = pressure > 0 ? 0.35 + pressure * 1.05 : THICK - (THICK - THIN) * Math.min(1, this.speed / FAST);
    this.width += (target - this.width) * 0.3;
    return this.width;
  }

  /** The pointer is at (x, y) at time `t`. Returns any new points; `pressure` is 0 unless it's a stylus. */
  move(x: number, y: number, t: number, pressure = 0): { points: number[]; press: number[] } {
    const dt = Math.max(1, t - this.t);
    const away = Math.hypot(x - this.x, y - this.y);
    this.speed += (away / dt - this.speed) * 0.4;
    if (away < MIN_STEP) return { points: [], press: [] };
    this.t = t;
    const follow = FOLLOW_SLOW + (FOLLOW_FAST - FOLLOW_SLOW) * Math.min(1, this.speed / FAST);
    this.x += (x - this.x) * follow;
    this.y += (y - this.y) * follow;
    return { points: [Math.round(this.x), Math.round(this.y)], press: [Math.round(this.ink(pressure) * 100)] };
  }

  /** The pointer lifted at (x, y): catches up with it, narrowing to a taper. */
  end(x: number, y: number): { points: number[]; press: number[] } {
    if (Math.hypot(x - this.x, y - this.y) < MIN_STEP) return { points: [], press: [] };
    return { points: [Math.round(x), Math.round(y)], press: [this.steady ? 100 : Math.round(this.width * 55)] };
  }
}

/** How far a pixel's colour can be from the start's and still be flooded, so soft line edges get filled too. */
const FILL_TOLERANCE = 96;

/** Floods the region around (x, y) in RGBA pixels with a colour, stopping at anything different. */
export function floodFill(data: Uint8ClampedArray, w: number, h: number, x: number, y: number, [r, g, b]: [number, number, number]): void {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const at = (y * w + x) * 4;
  const [r0, g0, b0] = [data[at], data[at + 1], data[at + 2]];
  if (r0 === r && g0 === g && b0 === b) return;
  const seen = new Uint8Array(w * h);
  const alike = (i: number) => Math.abs(data[i * 4] - r0) + Math.abs(data[i * 4 + 1] - g0) + Math.abs(data[i * 4 + 2] - b0) <= FILL_TOLERANCE;
  const stack = [y * w + x];
  while (stack.length) {
    const p = stack.pop()!;
    const row = p - (p % w);
    let left = p;
    while (left > row && !seen[left - 1] && alike(left - 1)) left--;
    let right = p;
    while (right < row + w - 1 && !seen[right + 1] && alike(right + 1)) right++;
    for (let i = left; i <= right; i++) {
      seen[i] = 1;
      data[i * 4] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = 255;
    }
    for (const next of [row - w, row + w]) {
      if (next < 0 || next >= w * h) continue;
      for (let i = left; i <= right; i++) {
        const q = next + (i - row);
        if (!seen[q] && alike(q) && (i === left || seen[q - 1] || !alike(q - 1))) stack.push(q);
      }
    }
  }
}

function paintFill(g: CanvasRenderingContext2D, stroke: Stroke): void {
  const { a, d } = g.getTransform();
  const { width, height } = g.canvas;
  // A sheet with no size yet has nothing to fill; it repaints when it gets one.
  if (!width || !height) return;
  const image = g.getImageData(0, 0, width, height);
  const hex = parseInt(stroke.color.slice(1), 16);
  floodFill(image.data, width, height, Math.round(stroke.points[0] * a), Math.round(stroke.points[1] * d), [hex >> 16, (hex >> 8) & 255, hex & 255]);
  g.putImageData(image, 0, 0);
}

/** Paints a stroke from point index `from` onto a 2D context already scaled to the sheet. */
export function paint(g: CanvasRenderingContext2D, stroke: Stroke, from = 0): void {
  if (stroke.fill) {
    paintFill(g, stroke);
    return;
  }
  const p = stroke.points;
  const widthAt = (i: number) => (stroke.width * (stroke.press?.[i] ?? 100)) / 100;
  g.strokeStyle = stroke.color;
  g.fillStyle = stroke.color;
  g.lineWidth = stroke.width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (p.length === 2) {
    g.beginPath();
    g.arc(p[0], p[1], widthAt(0) / 2, 0, Math.PI * 2);
    g.fill();
    return;
  }
  // Curves through the midpoints between points, so a quick stroke comes out smooth, not jagged.
  const n = p.length / 2;
  const mid = (i: number, axis: 0 | 1) => (p[i * 2 + axis] + p[i * 2 + 2 + axis]) / 2;
  // More of a stroke picks up where the last curve ended; the very start needs its first half-step.
  const first = Math.max(1, from / 2 - 1);

  if (stroke.press) {
    // Each piece gets its own width. Round ends hide the joins.
    let x = from >= 4 ? mid(first - 1, 0) : p[0];
    let y = from >= 4 ? mid(first - 1, 1) : p[1];
    const piece = (draw: () => void, width: number) => {
      g.lineWidth = width;
      g.beginPath();
      g.moveTo(x, y);
      draw();
      g.stroke();
    };
    if (from < 4) {
      piece(() => g.lineTo(mid(0, 0), mid(0, 1)), widthAt(0));
      x = mid(0, 0);
      y = mid(0, 1);
    }
    for (let i = first; i < n - 1; i++) {
      const toX = mid(i, 0);
      const toY = mid(i, 1);
      piece(() => g.quadraticCurveTo(p[i * 2], p[i * 2 + 1], toX, toY), widthAt(i));
      x = toX;
      y = toY;
    }
    piece(() => g.lineTo(p[n * 2 - 2], p[n * 2 - 1]), widthAt(n - 1));
    return;
  }

  g.beginPath();
  if (from >= 4) {
    g.moveTo(mid(first - 1, 0), mid(first - 1, 1));
  } else {
    g.moveTo(p[0], p[1]);
    g.lineTo(mid(0, 0), mid(0, 1));
  }
  for (let i = first; i < n - 1; i++) g.quadraticCurveTo(p[i * 2], p[i * 2 + 1], mid(i, 0), mid(i, 1));
  g.lineTo(p[n * 2 - 2], p[n * 2 - 1]);
  g.stroke();
}
