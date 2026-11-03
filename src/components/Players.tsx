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
  /** Shows the test-account login; returns an error to show, or null on success. */
  onTester?: (name: string, passcode: string) => string | null;
  onBack: () => void;
}

/** Players on this device: choose who's playing, or add a new one. */
export function Players({ profiles, activeId, firstRun, onCreate, onChoose, onTester, onBack }: Props) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [testName, setTestName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [testError, setTestError] = useState<string | null>(null);

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

      {onTester && (
        <form
          className="slip"
          onSubmit={(e) => {
            e.preventDefault();
            setTestError(onTester(testName, passcode));
          }}
        >
          <h2>Test account</h2>
          <p className="muted">Unlimited money and a pencil box with no limit, for trying every pen and power.</p>
          <label className="field">
            <span>User name</span>
            <input value={testName} onChange={(e) => setTestName(e.target.value)} autoComplete="username" />
          </label>
          <label className="field">
            <span>Passcode</span>
            <input
              type="password"
              inputMode="numeric"
              value={passcode}
              onChange={(e) => {
                setPasscode(e.target.value);
                setTestError(null);
              }}
              autoComplete="current-password"
            />
          </label>
          {testError && (
            <p className="error" role="alert">
              {testError}
            </p>
          )}
          <button type="submit" className="btn btn-secondary">
            Open test account
          </button>
        </form>
      )}

      {!firstRun && (
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          Go back
        </button>
      )}
    </main>
  );
}
