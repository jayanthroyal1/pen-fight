import { WIN_SCORE } from '../game/rules';

interface Props {
  onLocal: () => void;
  onAi: () => void;
  onOnline: () => void;
}

export function Menu({ onLocal, onAi, onOnline }: Props) {
  return (
    <main className="menu paper">
      <h1>Pen Fight</h1>
      <p className="tagline">Flick your pen. Knock theirs off the desk.</p>

      <div className="menu-actions">
        <button type="button" className="btn btn-primary" onClick={onAi}>
          Play the computer
        </button>
        <button type="button" className="btn btn-secondary" onClick={onLocal}>
          Play a friend on this device
        </button>
        <button type="button" className="btn btn-secondary" onClick={onOnline}>
          Play online
        </button>
      </div>

      <section className="how">
        <h2>How to play</h2>
        <ol>
          <li>Press on your pen, pull back like a slingshot and let go.</li>
          <li>Where you press matters: near the tip spins the pen, the middle sends it straight.</li>
          <li>Knock the other pen off the desk to win the round. Slide off yourself and you lose it.</li>
          <li>First to {WIN_SCORE} rounds wins the match.</li>
        </ol>
      </section>
    </main>
  );
}
