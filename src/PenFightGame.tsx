import { App } from './App';
import { initPhysics } from './game/world';
import './styles.css';

// Pen Fight's own handwriting fonts, only needed once the game is opened.
const fonts = document.createElement('link');
fonts.rel = 'stylesheet';
fonts.href = 'https://fonts.googleapis.com/css2?family=Oswald:wght@600;700&family=Patrick+Hand&family=Special+Elite&display=swap';
document.head.append(fonts);

// The physics engine loads while the game's intro plays; the game waits for it before leaving the intro.
const physics = initPhysics();

/** Pen Fight as one game on the platform, loaded only when it's opened. */
export default function PenFightGame({ onExit }: { onExit: () => void }) {
  return <App physics={physics} onExit={onExit} />;
}
