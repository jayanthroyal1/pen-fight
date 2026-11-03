import { useState } from 'react';
import { ROOMS, type Room } from '../game/rooms';
import { boxLimit, entryProblem, type Profile } from '../profile/economy';
import { PenBox, PenSwatch, Rupees } from './PenBox';

export type PlayMode = 'online' | 'local' | 'ai';

interface Props {
  profile: Profile;
  notices: string[];
  onDismissNotices: () => void;
  /** A game mode chosen; online and local then ask for a level. */
  onMode: (mode: PlayMode) => void;
  /** A level (classroom) chosen, and how to play in it. */
  onLevel: (room: Room, mode: 'online' | 'local') => void;
  onStore: () => void;
  onSettings: () => void;
}

const MODES: { id: PlayMode; title: string; note: string }[] = [
  { id: 'online', title: 'Play online', note: 'Quick match, invite link or room code. For rupees and pens.' },
  { id: 'local', title: 'Play a friend here', note: 'Two players, one desk. Each bets their own pens.' },
  { id: 'ai', title: 'Practice', note: 'Against the computer: Easy, Medium or Hard. Nothing to lose.' },
];

/** The first screen after the intro: who you are, how to play, which classroom, and the store. */
export function Dashboard({ profile, notices, onDismissNotices, onMode, onLevel, onStore, onSettings }: Props) {
  const [openLevel, setOpenLevel] = useState<string | null>(null);

  return (
    <main className="dashboard">
      <header className="dash-head">
        <h1 className="dash-title">Pen Fight</h1>
        <span className="dash-player">
          <span className="dash-name">{profile.name}</span>
          <Rupees amount={profile.rupees} />
        </span>
        <button type="button" className="icon-btn" onClick={onSettings} aria-label="Open settings" aria-describedby="settings-tip">
          <GearIcon />
          <span id="settings-tip" role="tooltip" className="tooltip">
            Open settings
          </span>
        </button>
      </header>

      {notices.length > 0 && (
        <div className="slip" role="status">
          {notices.map((n) => (
            <p key={n}>{n}</p>
          ))}
          <button type="button" className="btn btn-secondary" onClick={onDismissNotices}>
            Dismiss
          </button>
        </div>
      )}

      <section className="dash-section" aria-labelledby="modes-title">
        <h2 id="modes-title" className="section-tab">
          Game modes
        </h2>
        <ul className="mode-grid">
          {MODES.map((m) => (
            <li key={m.id}>
              <button type="button" className={`mode-card mode-${m.id}`} onClick={() => onMode(m.id)}>
                <span className="mode-title">{m.title}</span>
                <span className="mode-note">{m.note}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="dash-section" aria-labelledby="levels-title">
        <h2 id="levels-title" className="section-tab">
          Levels
        </h2>
        <ul className="room-list">
          {ROOMS.map((room, i) => {
            const problem = entryProblem(profile, room);
            const open = openLevel === room.id;
            return (
              <li key={room.id}>
                <div className={`room-card room-${room.id}${problem ? ' is-locked' : ''}`}>
                  <button
                    type="button"
                    className="room-main"
                    disabled={!!problem}
                    aria-expanded={open}
                    onClick={() => setOpenLevel(open ? null : room.id)}
                  >
                    <span className="room-level">Level {i + 1}</span>
                    <span className="room-name">{room.name}</span>
                    <span className="room-bet">
                      <Rupees amount={room.bet} /> bet
                    </span>
                    <span className="room-meta">
                      Level {room.minLevel}+ pens · {room.sound}
                    </span>
                    {problem && <span className="room-locked">{problem}</span>}
                  </button>
                  {open && (
                    <span className="room-play">
                      <button type="button" className="btn btn-primary btn-small" onClick={() => onLevel(room, 'online')}>
                        Play online
                      </button>
                      <button type="button" className="btn btn-secondary btn-small" onClick={() => onLevel(room, 'local')}>
                        Play a friend here
                      </button>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="dash-section" aria-labelledby="store-title">
        <h2 id="store-title" className="section-tab">
          Store
        </h2>
        <button type="button" className="store-card" onClick={onStore}>
          <span className="store-pens" aria-hidden>
            <PenSwatch model="butterfly-pink" />
            <PenSwatch model="exec-gold-clip" />
            <PenSwatch model="teal-alu" power="giant" />
          </span>
          <span className="mode-title">Pen store</span>
          <span className="mode-note">20 pens in five levels, and seven hero powers.</span>
        </button>
      </section>

      <PenBox pens={profile.pens} limit={boxLimit(profile)} label="Your pencil box" />
    </main>
  );
}

function GearIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3.3h-4l-.4 2.6a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1l.4 2.6h4l.4-2.6c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
        transform="translate(-1 0)"
      />
    </svg>
  );
}
