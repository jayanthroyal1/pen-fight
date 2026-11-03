import { useState } from 'react';
import type { Profile } from '../profile/economy';
import { Rupees } from './PenBox';

interface Props {
  profiles: Profile[];
  activeId: string | null;
  /** First run: no players yet, so no way back. */
  firstRun?: boolean;
  onCreate: (name: string) => void;
  onChoose: (id: string) => void;
  onBack: () => void;
}

/** Players on this device: choose who's playing, or add a new one. */
export function Players({ profiles, activeId, firstRun, onCreate, onChoose, onBack }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Write your name on the label.');
      return;
    }
    onCreate(name.trim());
    setName('');
  };

  return (
    <main className="cover">
      <header className="name-label">
        <h1 className="label-title">{firstRun ? 'New notebook' : 'Players'}</h1>
        <p className="label-note">
          {firstRun
            ? 'Every new player gets ₹100 and three pens to start.'
            : 'Each player keeps their own money and pencil box.'}
        </p>
      </header>

      {profiles.length > 0 && (
        <ul className="player-list">
          {profiles.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={`player-card${p.id === activeId ? ' is-active' : ''}`}
                onClick={() => onChoose(p.id)}
                aria-current={p.id === activeId}
              >
                <span className="player-name">{p.name}</span>
                <span className="player-meta">
                  <Rupees amount={p.rupees} /> · {p.pens.length} pens
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="slip" onSubmit={submit}>
        <label className="field">
          <span>New player&apos;s name</span>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            maxLength={20}
            autoComplete="nickname"
            placeholder="e.g. Ravi"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary">
          Add player
        </button>
      </form>

      {!firstRun && (
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Back
        </button>
      )}
    </main>
  );
}
