import { useState } from 'react';
import { DIFFICULTY, type Difficulty } from '../game/ai';
import type { Room } from '../game/rooms';
import { boxLimit, eligiblePens, penLevel, type OwnedPen, type Profile } from '../profile/economy';
import { PenBox } from './PenBox';

interface Props {
  title: string;
  hint?: string;
  profile: Profile;
  /** The bet room, whose level rule limits the pens; none for practice. */
  room: Room | null;
  /** Show the computer's difficulty choice. */
  askDifficulty?: boolean;
  confirmLabel: string;
  onConfirm: (pen: OwnedPen, difficulty: Difficulty) => void;
  onBack: () => void;
}

const DIFFICULTY_KEY = 'penfight:difficulty';

function savedDifficulty(): Difficulty {
  try {
    const v = localStorage.getItem(DIFFICULTY_KEY);
    return v === 'easy' || v === 'hard' ? v : 'medium';
  } catch {
    return 'medium';
  }
}

/** Pick the pen to fight with from your pencil box, and for practice, how hard the computer plays. */
export function PenSelect({ title, hint, profile, room, askDifficulty, confirmLabel, onConfirm, onBack }: Props) {
  const allowed = room ? eligiblePens(profile, room) : profile.pens;
  const [selected, setSelected] = useState<string | null>(allowed[0]?.uid ?? null);
  const [difficulty, setDifficulty] = useState<Difficulty>(savedDifficulty);
  const [error, setError] = useState<string | null>(null);
  const pen = profile.pens.find((p) => p.uid === selected) ?? null;

  return (
    <main className="cover">
      <header className="name-label">
        <h1 className="label-title">{title}</h1>
        {hint && <p className="label-note">{hint}</p>}
      </header>

      <form
        className="picker-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pen) {
            setError(room ? `Pick a level ${room.minLevel}+ pen from your pencil box.` : 'Pick a pen from your pencil box.');
            return;
          }
          try {
            localStorage.setItem(DIFFICULTY_KEY, difficulty);
          } catch {
            // Remembering is only a convenience.
          }
          onConfirm(pen, difficulty);
        }}
      >
        <PenBox
          pens={profile.pens}
          selected={selected}
          onSelect={(uid) => {
            setSelected(uid);
            setError(null);
          }}
          label={`${profile.name}'s pencil box`}
          limit={boxLimit(profile)}
          disabled={(p) => (room && penLevel(p) < room.minLevel ? `Needs level ${room.minLevel}+` : null)}
        />
        {room && <p className="muted">If you lose, this pen goes to the winner.</p>}

        {askDifficulty && (
          <fieldset className="difficulty">
            <legend>Computer</legend>
            {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
              <label key={d} className={`chip${difficulty === d ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="difficulty"
                  className="visually-hidden"
                  checked={difficulty === d}
                  onChange={() => setDifficulty(d)}
                />
                {DIFFICULTY[d].label}
              </label>
            ))}
          </fieldset>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="picker-actions">
          <button type="submit" className="btn btn-primary">
            {confirmLabel}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            Go back
          </button>
        </div>
      </form>
    </main>
  );
}
