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
  const start = Math.max(0, from - 2);
  g.beginPath();
  g.moveTo(p[start], p[start + 1]);
  for (let i = start + 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]);
  g.stroke();
}
