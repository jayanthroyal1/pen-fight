/** The drawing, as data small enough to send: strokes on a 1000 × 750 sheet. */

export const SHEET_W = 1000;
export const SHEET_H = 750;

export interface Stroke {
  id: string;
  color: string;
  width: number;
  /** x, y, x, y… */
  points: number[];
}

/** One change to the drawing: more of a stroke, take the last stroke back, or wipe the sheet. */
export type InkOp =
  | { k: 'add'; id: string; color: string; width: number; points: number[] }
  | { k: 'undo' }
  | { k: 'clear' };

export function applyInk(strokes: Stroke[], op: InkOp): Stroke[] {
  if (op.k === 'clear') return [];
  if (op.k === 'undo') return strokes.slice(0, -1);
  const last = strokes[strokes.length - 1];
  if (last?.id === op.id) return [...strokes.slice(0, -1), { ...last, points: [...last.points, ...op.points] }];
  return [...strokes, { id: op.id, color: op.color, width: op.width, points: op.points }];
}

/** Paints strokes from point index `from` of each onto a 2D context already scaled to the sheet. */
export function paint(g: CanvasRenderingContext2D, stroke: Stroke, from = 0): void {
  const p = stroke.points;
  g.strokeStyle = stroke.color;
  g.fillStyle = stroke.color;
  g.lineWidth = stroke.width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (p.length === 2) {
    g.beginPath();
    g.arc(p[0], p[1], stroke.width / 2, 0, Math.PI * 2);
    g.fill();
    return;
  }
  // Curves through the midpoints between points, so a quick stroke comes out smooth, not jagged.
  const n = p.length / 2;
  const mid = (i: number, axis: 0 | 1) => (p[i * 2 + axis] + p[i * 2 + 2 + axis]) / 2;
  // More of a stroke picks up where the last curve ended; the very start needs its first half-step.
  const first = Math.max(1, from / 2 - 1);
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
