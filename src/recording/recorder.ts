import type { PenModelId } from '../game/pens';
import type { Flick, GameState, Pen, PlayerId } from '../game/types';
import type { Impact } from '../game/world';
import type { MatchStore } from './store';
import type { MatchMode, MatchRecord, PenPose, ShotRecord } from './types';

/** Record pen movement every this many physics steps (every 3 steps at 60 Hz = 20 frames/s). */
export const SAMPLE_EVERY = 3;

const round2 = (v: number) => Math.round(v * 100) / 100;
const round4 = (v: number) => Math.round(v * 10000) / 10000;

export function pose(pen: Pen): PenPose {
  return {
    x: round2(pen.x),
    y: round2(pen.y),
    h: round2(pen.h),
    q: pen.q.map(round4) as PenPose['q'],
    out: pen.out,
  };
}

const poses = (pens: [Pen, Pen]): [PenPose, PenPose] => [pose(pens[0]), pose(pens[1])];

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Records a match shot by shot: every flick, the pens' movement while they
 * slide, every impact, and how each shot ended. Saves after each shot.
 */
export class MatchRecorder {
  private record: MatchRecord;
  private shot: ShotRecord | null = null;
  private steps = 0;
  private saving: Promise<void> = Promise.resolve();

  constructor(
    private store: MatchStore,
    opts: {
      mode: MatchMode;
      players: [{ name: string; model: PenModelId }, { name: string; model: PenModelId }];
      me: PlayerId | null;
    },
  ) {
    const now = new Date().toISOString();
    this.record = {
      id: newId(),
      version: 1,
      mode: opts.mode,
      startedAt: now,
      updatedAt: now,
      endedAt: null,
      players: opts.players,
      me: opts.me,
      shots: [],
      winner: null,
      scores: [0, 0],
    };
  }

  get id(): string {
    return this.record.id;
  }

  beginShot(state: GameState, flick: Flick): void {
    const shooter = state.turn;
    this.steps = 0;
    this.shot = {
      index: this.record.shots.length,
      round: state.round,
      shooter,
      model: state.pens[shooter].model,
      flick: { along: round2(flick.along), ix: round2(flick.ix), iy: round2(flick.iy) },
      at: new Date().toISOString(),
      before: poses(state.pens),
      after: null,
      frames: [],
      impacts: [],
      outcome: null,
    };
    this.record.shots.push(this.shot);
  }

  /** Call after every physics step of the shot. */
  step(pens: [Pen, Pen], impacts: Impact[], stepMs: number): void {
    if (!this.shot) return;
    this.steps++;
    const t = Math.round(this.steps * stepMs);
    for (const i of impacts) {
      this.shot.impacts.push(
        i.kind === 'pens' || i.kind === 'wall'
          ? { t, kind: i.kind, strength: round2(i.strength) }
          : i.kind === 'desk'
            ? { t, kind: i.kind, strength: round2(i.strength), pen: i.pen }
            : { t, kind: i.kind, pen: i.pen },
      );
    }
    if (this.steps % SAMPLE_EVERY === 0) this.shot.frames.push({ t, pens: poses(pens) });
  }

  /** Call with the state once the shot is resolved (or the synced state online). */
  endShot(state: GameState): Promise<void> {
    if (this.shot) {
      this.shot.after = poses(state.pens);
      this.shot.outcome = {
        roundWinner: state.roundWinner,
        reason: state.roundReason,
        scores: [...state.scores],
      };
      this.shot = null;
    }
    this.record.scores = [...state.scores];
    if (state.phase === 'matchOver') {
      this.record.winner = state.roundWinner;
      this.record.endedAt = new Date().toISOString();
    }
    return this.save();
  }

  snapshot(): MatchRecord {
    return structuredClone(this.record);
  }

  private save(): Promise<void> {
    this.record.updatedAt = new Date().toISOString();
    const copy = this.snapshot();
    // Saves run one after another so an older copy never overwrites a newer one.
    this.saving = this.saving
      .then(() => this.store.save(copy))
      .catch((err) => console.warn('Could not save the match recording', err));
    return this.saving;
  }
}
