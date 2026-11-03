import { useState } from 'react';
import type { Profile } from '../profile/economy';
import { Rupees } from './PenBox';

interface Props {
  me: Profile;
  others: Profile[];
  onChoose: (id: string) => void;
  onCreate: (name: string) => void;
  onBack: () => void;
}

/** Same phone: who is playing against you. Each player bets their own money and pens. */
export function OpponentSelect({ me, others, onChoose, onCreate, onBack }: Props) {
  const [name, setName] = useState('');
  return (
    <main className="cover">
      <header className="name-label">
        <h1 className="label-title">Who&apos;s playing {me.name}?</h1>
        <p className="label-note">Both players bet their own rupees and pens.</p>
      </header>

      {others.length > 0 ? (
        <ul className="player-list">
          {others.map((p) => (
            <li key={p.id}>
              <button type="button" className="player-card" onClick={() => onChoose(p.id)}>
                <span className="player-name">{p.name}</span>
                <span className="player-meta">
                  <Rupees amount={p.rupees} /> · {p.pens.length} pens
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No other players on this phone yet. Add your friend below.</p>
      )}

      <form
        className="slip"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onCreate(name.trim());
        }}
      >
        <label className="field">
          <span>Friend&apos;s name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="e.g. Sita" />
        </label>
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
          Add and play
        </button>
      </form>

      <button type="button" className="btn btn-secondary" onClick={onBack}>
        Back
      </button>
    </main>
  );
}
