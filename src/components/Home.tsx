import { boxLimit, type Profile } from '../profile/economy';
import { PenBox, Rupees } from './PenBox';

interface Props {
  profile: Profile;
  notices: string[];
  onDismissNotices: () => void;
  onOnline: () => void;
  onLocal: () => void;
  onPractice: () => void;
  onStore: () => void;
  onPlayers: () => void;
}

/** The notebook cover: who's playing, their money and pencil box, and where to go. */
export function Home({ profile, notices, onDismissNotices, onOnline, onLocal, onPractice, onStore, onPlayers }: Props) {
  return (
    <main className="cover">
      <header className="name-label">
        <h1 className="label-title">Pen Fight</h1>
        <dl>
          <div>
            <dt>Name</dt>
            <dd>{profile.name}</dd>
          </div>
          <div>
            <dt>Money</dt>
            <dd>
              <Rupees amount={profile.rupees} />
            </dd>
          </div>
        </dl>
      </header>

      {notices.length > 0 && (
        <div className="slip" role="status">
          {notices.map((n) => (
            <p key={n}>{n}</p>
          ))}
          <button type="button" className="btn btn-secondary" onClick={onDismissNotices}>
            Got it
          </button>
        </div>
      )}

      <PenBox pens={profile.pens} limit={boxLimit(profile)} />

      <nav className="menu-actions" aria-label="Play">
        <button type="button" className="btn btn-primary" onClick={onOnline}>
          Play online for rupees
        </button>
        <button type="button" className="btn btn-secondary" onClick={onLocal}>
          Play a friend on this phone
        </button>
        <button type="button" className="btn btn-secondary" onClick={onPractice}>
          Practise against the computer
        </button>
        <button type="button" className="btn btn-secondary" onClick={onStore}>
          Pen store
        </button>
        <button type="button" className="btn btn-link" onClick={onPlayers}>
          Switch or add player
        </button>
      </nav>

      <section className="how">
        <h2>Rules of the bench</h2>
        <ol>
          <li>Press on your pen, pull back like a slingshot and let go. The dashes turn red at full stretch.</li>
          <li>Knock the other pen off the desk to win a round. Both pens off together is a draw.</li>
          <li>Best of three: two rounds wins. At one each it goes to a final round.</li>
          <li>The winner takes the bet and the loser&apos;s pen, hero power and all.</li>
        </ol>
      </section>
    </main>
  );
}
