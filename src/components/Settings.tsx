import { useState } from 'react';
import { sounds } from '../audio/sounds';
import { QUALITY_LABELS, resolveQuality, saveQuality, savedQuality, type Quality } from '../game/quality';
import type { Profile } from '../profile/economy';

interface Props {
  profile: Profile;
  onRename: (name: string) => void;
  onPlayers: () => void;
  onBack: () => void;
}

/** Profile and sound settings, behind the gear on the dashboard. */
export function Settings({ profile, onRename, onPlayers, onBack }: Props) {
  const [name, setName] = useState(profile.name);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(sounds.muted);
  const [chatter, setChatter] = useState(sounds.chatterVolume);
  const [quality, setQuality] = useState<Quality>(savedQuality);

  return (
    <main className="cover">
      <header className="name-label">
        <h1 className="label-title">Settings</h1>
        <p className="label-note">
          Playing as {profile.name}
          {profile.tester && ' · test account'}
        </p>
      </header>

      <form
        className="slip"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) {
            setError('Write a name on the label.');
            return;
          }
          onRename(name.trim());
          setSaved(true);
        }}
      >
        <h2>Profile</h2>
        <label className="field">
          <span>Your name</span>
          <input
            value={name}
            maxLength={20}
            autoComplete="nickname"
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
              setError(null);
            }}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {saved && (
          <p className="stamp-note" role="status">
            Saved
          </p>
        )}
        <button type="submit" className="btn btn-primary">
          Save name
        </button>
        <button type="button" className="btn btn-secondary" onClick={onPlayers}>
          Switch or add player
        </button>
      </form>

      <section className="slip" aria-labelledby="sound-title">
        <h2 id="sound-title">Sound</h2>
        <label className="toggle">
          <input
            type="checkbox"
            checked={!muted}
            onChange={(e) => {
              sounds.unlock();
              sounds.setMuted(!e.target.checked);
              setMuted(!e.target.checked);
            }}
          />
          <span>Game sounds</span>
        </label>
        <label className="field">
          <span>Classroom noise {chatter === 0 ? '(off)' : `${Math.round(chatter * 100)}%`}</span>
          <input
            type="range"
            className="slider"
            min={0}
            max={1}
            step={0.05}
            value={chatter}
            onChange={(e) => {
              sounds.unlock();
              sounds.setChatterVolume(Number(e.target.value));
              setChatter(Number(e.target.value));
            }}
          />
        </label>
      </section>

      <section className="slip" aria-labelledby="graphics-title">
        <h2 id="graphics-title">Graphics</h2>
        <fieldset className="difficulty">
          <legend className="visually-hidden">Graphics quality</legend>
        {(Object.keys(QUALITY_LABELS) as Quality[]).map((q) => (
          <label key={q} className={`chip${quality === q ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name="quality"
              className="visually-hidden"
              checked={quality === q}
              onChange={() => {
                saveQuality(q);
                setQuality(q);
              }}
            />
            {QUALITY_LABELS[q]}
            {q === 'auto' && ` (${QUALITY_LABELS[resolveQuality('auto')]})`}
          </label>
        ))}
        </fieldset>
        <p className="muted">
          High adds soft shadows where pens meet the desk. Low is smoother on older phones. Applies from your next game.
        </p>
      </section>

      <button type="button" className="btn btn-secondary" onClick={onBack}>
        Go back
      </button>
    </main>
  );
}
