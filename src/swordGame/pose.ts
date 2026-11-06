import { solveKnee, type Pt } from '../runnerGame/rig';

/** Where a stick man's joints are, in metres, feet at y = 0 and facing +x. */
export interface Pose {
  hip: Pt;
  neck: Pt;
  head: Pt;
  elbowF: Pt;
  handF: Pt;
  elbowB: Pt;
  handB: Pt;
  kneeF: Pt;
  footF: Pt;
  kneeB: Pt;
  footB: Pt;
  /** The blade's direction, in radians: 0 is straight ahead, up is positive. */
  sword: number;
}

export type Stance = 'idle' | 'run' | 'air' | 'block' | 'swing' | 'stun' | 'dash';

export interface Motion {
  stance: Stance;
  /** Seconds, for breathing. */
  time: number;
  /** Stride, in cycles. */
  stride: number;
  /** 0 to 1 through a swing. */
  swing: number;
  combo: number;
  vy: number;
}

const UPPER = 0.34;
const LOWER = 0.36;
const THIGH = 0.47;
const SHIN = 0.47;
const REST_SWORD = 0.95;
/** Where each swing of a combo starts and ends. */
const ARCS: [number, number][] = [
  [2.2, -0.8],
  [-0.9, 2.0],
  [2.8, -1.2],
];

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => t * t * (3 - 2 * t);

export function poseFor(m: Motion): Pose {
  const breathe = Math.sin(m.time * 2.6) * 0.012;
  let hipY = 0.88 + breathe;
  let lean = 0.1;
  let hipX = 0;
  let footF: Pt = { x: 0.26, y: 0 };
  let footB: Pt = { x: -0.3, y: 0 };
  let sword = REST_SWORD;
  let reach = 0.5;

  if (m.stance === 'run') {
    const a = m.stride * Math.PI * 2;
    hipY = 0.9 + Math.abs(Math.sin(a)) * 0.05;
    lean = 0.32;
    footF = { x: Math.cos(a) * 0.46 + 0.06, y: Math.max(0, Math.sin(a)) * 0.26 };
    footB = { x: -Math.cos(a) * 0.46 + 0.06, y: Math.max(0, -Math.sin(a)) * 0.26 };
    sword = 0.25;
    reach = 0.42;
  } else if (m.stance === 'air') {
    hipY = 0.92;
    lean = 0.2;
    const tuck = m.vy > 0 ? 0.3 : 0.1;
    footF = { x: 0.32, y: 0.2 + tuck };
    footB = { x: -0.26, y: 0.1 + tuck * 0.7 };
    sword = 1.3;
  } else if (m.stance === 'block') {
    hipY = 0.8;
    lean = -0.04;
    footF = { x: 0.34, y: 0 };
    footB = { x: -0.4, y: 0 };
    sword = 1.62;
    reach = 0.44;
  } else if (m.stance === 'stun') {
    hipY = 0.84;
    lean = -0.34;
    hipX = -0.08;
    sword = -0.5;
    reach = 0.6;
  } else if (m.stance === 'dash') {
    hipY = 0.62;
    lean = 0.75;
    footF = { x: 0.6, y: 0 };
    footB = { x: -0.72, y: 0.08 };
    sword = -0.15;
    reach = 0.68;
  } else if (m.stance === 'swing') {
    const [from, to] = ARCS[m.combo % ARCS.length];
    const p = m.swing;
    const heavy = m.combo === 2;
    if (p < 0.3) {
      const k = ease(p / 0.3);
      sword = mix(REST_SWORD, from, k);
      lean = mix(0.1, -0.08, k);
    } else if (p < 0.75) {
      const k = ease((p - 0.3) / 0.45);
      sword = mix(from, to, k);
      lean = mix(-0.08, heavy ? 0.5 : 0.34, k);
      hipX = k * (heavy ? 0.24 : 0.14);
      hipY = 0.84;
    } else {
      const k = ease((p - 0.75) / 0.25);
      sword = mix(to, REST_SWORD, k);
      lean = mix(heavy ? 0.5 : 0.34, 0.1, k);
      hipX = (1 - k) * (heavy ? 0.24 : 0.14);
    }
    footF = { x: 0.42, y: 0 };
    footB = { x: -0.42, y: 0 };
    reach = 0.6;
  }

  const hip = { x: hipX, y: hipY };
  const neck = { x: hipX + Math.sin(lean) * 0.62, y: hipY + Math.cos(lean) * 0.62 };
  const head = { x: neck.x + Math.sin(lean) * 0.2, y: neck.y + 0.2 };
  const shoulder = { x: neck.x, y: neck.y - 0.05 };
  const swing = sword * 0.72;
  const handF = { x: shoulder.x + Math.cos(swing) * reach, y: shoulder.y + Math.sin(swing) * reach - 0.1 };
  // The free hand trails behind, for balance, or supports the grip behind a guard.
  const handB =
    m.stance === 'block'
      ? { x: shoulder.x + 0.3, y: shoulder.y - 0.26 }
      : { x: shoulder.x - 0.34 + Math.sin(m.stride * Math.PI * 2) * 0.1, y: shoulder.y - 0.34 + breathe };
  return {
    hip,
    neck,
    head,
    handF,
    handB,
    elbowF: solveKnee(shoulder, handF, UPPER, LOWER, -1),
    elbowB: solveKnee(shoulder, handB, UPPER, LOWER, -1),
    footF,
    footB,
    kneeF: solveKnee(hip, footF, THIGH, SHIN, 1),
    kneeB: solveKnee(hip, footB, THIGH, SHIN, 1),
    sword,
  };
}
