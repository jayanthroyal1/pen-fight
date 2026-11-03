import type { PenModelId } from '../game/pens';
import type { Flick, PlayerId, RoundReason } from '../game/types';

export type MatchMode = 'local' | 'ai' | 'online';

/** A pen's 3D pose; desk pixels, height above the desk top, quaternion. */
export interface PenPose {
  x: number;
  y: number;
  h: number;
  q: [number, number, number, number];
  out: boolean;
}

export interface MovementFrame {
  /** Milliseconds of game time since the flick. */
  t: number;
  pens: [PenPose, PenPose];
}

export interface ImpactRecord {
  t: number;
  kind: 'pens' | 'desk' | 'fall' | 'zap' | 'wall';
  strength?: number;
  pen?: PlayerId;
}

export interface ShotRecord {
  index: number;
  round: number;
  shooter: PlayerId;
  model: PenModelId;
  flick: Flick;
  /** Wall-clock time of the flick, ISO 8601. */
  at: string;
  before: [PenPose, PenPose];
  after: [PenPose, PenPose] | null;
  /** Pen movement sampled through the shot. */
  frames: MovementFrame[];
  impacts: ImpactRecord[];
  outcome: {
    roundWinner: PlayerId | null;
    reason: RoundReason | null;
    scores: [number, number];
  } | null;
}

export interface MatchRecord {
  id: string;
  version: 1;
  mode: MatchMode;
  startedAt: string;
  updatedAt: string;
  endedAt: string | null;
  players: [{ name: string; model: PenModelId }, { name: string; model: PenModelId }];
  /** Which player this device controlled, for online and vs-computer games. */
  me: PlayerId | null;
  shots: ShotRecord[];
  winner: PlayerId | null;
  scores: [number, number];
}
