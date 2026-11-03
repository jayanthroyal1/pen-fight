import { ROOMS, type Room } from '../game/rooms';
import { entryProblem, type Profile } from '../profile/economy';
import { Rupees } from './PenBox';

interface Props {
  title: string;
  /** Every player who has to afford the room (both, on one phone). */
  players: Profile[];
  onChoose: (room: Room) => void;
  onBack: () => void;
}

/** The four bet rooms, each a different school, with who can't get in and why. */
export function RoomSelect({ title, players, onChoose, onBack }: Props) {
  return (
    <main className="cover">
      <header className="name-label">
        <h1 className="label-title">{title}</h1>
        <p className="label-note">The winner takes both bets and the loser&apos;s pen.</p>
      </header>

      <ul className="room-list">
        {ROOMS.map((room) => {
          const problems = players
            .map((p) => {
              const why = entryProblem(p, room);
              return why ? (players.length > 1 ? `${p.name}: ${why}` : why) : null;
            })
            .filter(Boolean);
          return (
            <li key={room.id}>
              <button
                type="button"
                className={`room-card room-${room.id}`}
                disabled={problems.length > 0}
                onClick={() => onChoose(room)}
              >
                <span className="room-bet">
                  <Rupees amount={room.bet} />
                </span>
                <span className="room-name">{room.name}</span>
                <span className="room-meta">
                  Level {room.minLevel}+ pens · {room.sound}
                </span>
                {problems.map((p) => (
                  <span key={p} className="room-locked">
                    {p}
                  </span>
                ))}
              </button>
            </li>
          );
        })}
      </ul>

      <button type="button" className="btn btn-secondary" onClick={onBack}>
        Back
      </button>
    </main>
  );
}
