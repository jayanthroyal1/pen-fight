import { BackIcon } from './art';

interface Props {
  game: string;
  code: string;
  /** One line about the room, such as what's at stake. */
  detail?: string;
  name: string;
  onName: (name: string) => void;
  joining: boolean;
  error: string | null;
  onJoin: () => void;
  /** Ignore the invite and start something of your own. */
  onCreate: () => void;
  onExit: () => void;
}

/**
 * What anyone opening a friend's invite sees, in every game: the room, their
 * name and one big Join button, with a small way out to make their own room.
 */
export function InviteEntry({ game, code, detail, name, onName, joining, error, onJoin, onCreate, onExit }: Props) {
  return (
    <div className="wp-root">
      <main className="wp-page">
        <div className="wp-wrap wp-invite">
          <header className="wp-top">
            <button type="button" className="wp-icon-btn" aria-label="Go back to WildPlayers" title="Go back to WildPlayers" onClick={onExit}>
              <BackIcon />
            </button>
            <p className="wp-invite-game">{game}</p>
          </header>
          <form
            className="wp-invite-card"
            onSubmit={(e) => {
              e.preventDefault();
              onJoin();
            }}
          >
            <p className="wp-invite-label">You’re invited to room</p>
            <p className="wp-invite-code">{code}</p>
            {detail && <p className="wp-invite-detail">{detail}</p>}
            <label className="wp-invite-field">
              <span>Your name</span>
              <input value={name} maxLength={16} autoComplete="nickname" autoFocus={!name} onChange={(e) => onName(e.target.value)} />
            </label>
            <button type="submit" className="wp-play">
              {joining ? 'Joining…' : 'Join room'}
            </button>
            {error && (
              <p className="wp-invite-error" role="alert">
                {error}
              </p>
            )}
          </form>
          <button type="button" className="wp-invite-create" onClick={onCreate}>
            Create your own room instead
          </button>
        </div>
      </main>
    </div>
  );
}
