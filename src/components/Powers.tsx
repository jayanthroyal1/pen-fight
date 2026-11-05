import { BOOSTS, boost as boostOf, type BoostId } from '../game/boosts';
import { BoostIcon } from './BoostIcon';

interface Props {
  /** Unique per player, ties the button to its list. */
  id: string;
  /** Sits at the far end of the desk, turned round to face the player sitting there. */
  far: boolean;
  /** This player's role in the shot being taken. */
  role: 'attack' | 'defend';
  title: string;
  /** The pens are moving, so nothing can be chosen yet. */
  moving: boolean;
  /** The power this player has on for this shot. */
  chosen: BoostId | null;
  canUse: (id: BoostId) => boolean;
  open: boolean;
  message: string | null;
  onToggle: () => void;
  onPick: (id: BoostId) => void;
}

/** One player's super powers: a round button, and a column that floats up when it's tapped. */
export function Powers({ id, far, role, title, moving, chosen, canUse, open, message, onToggle, onPick }: Props) {
  const listId = `power-list-${id}`;
  const label = open ? 'Hide super powers' : chosen ? `${boostOf(chosen).name} is on` : 'Show super powers';
  return (
    <div className={`powers${far ? ' is-far' : ''}`}>
      {message && (
        <p className="power-msg" role="alert">
          {message}
        </p>
      )}
      {open && (
        <div id={listId} className="power-list" role="group" aria-label="Super powers">
          <p className="power-head">{moving ? 'Wait for the pens to stop.' : title}</p>
          {!moving &&
            BOOSTS.filter((b) => (role === 'attack' ? b.timing !== 'theirs' : b.timing !== 'mine')).map((b, i) => {
              const armed = chosen === b.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  className={`power-btn${armed ? ' is-armed' : ''}${!armed && !canUse(b.id) ? ' is-empty' : ''}`}
                  style={{ '--boost': b.color, '--i': i } as React.CSSProperties}
                  aria-pressed={armed}
                  title={b.tagline}
                  onClick={() => onPick(b.id)}
                >
                  <span className="power-icon">
                    <BoostIcon id={b.id} />
                  </span>
                  <span className="power-name">{b.name}</span>
                </button>
              );
            })}
        </div>
      )}
      <button
        type="button"
        className={`powers-toggle${open ? ' is-open' : ''}${chosen ? ' is-armed' : ''}`}
        style={chosen ? ({ '--boost': boostOf(chosen).color } as React.CSSProperties) : undefined}
        aria-expanded={open}
        aria-controls={listId}
        title={label}
        onClick={onToggle}
      >
        <BoostIcon id={chosen ?? 'lightning'} />
        <span className="visually-hidden">{label}</span>
      </button>
    </div>
  );
}
