import { useEffect, useRef } from 'react';
import { PenSwatch } from './PenBox';

interface Props {
  onDone: () => void;
  /** The intro has finished but the game is still loading. */
  loading?: boolean;
}

/** How long the intro plays before moving on by itself. */
const INTRO_MS = 3400;

/**
 * The opening animation: two pens slide in from either side of the desk,
 * clash in a burst of sparks, and the title is stamped down. Tap to skip.
 */
export function Splash({ onDone, loading = false }: Props) {
  const done = useRef(onDone);
  done.current = onDone;
  // Runs once: the timer isn't restarted when the app re-renders around it.
  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const id = window.setTimeout(() => done.current(), reduced ? 1200 : INTRO_MS);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <button type="button" className="splash" onClick={onDone} aria-label="Pen Fight. Tap to start.">
      <span className="splash-desk" aria-hidden>
        <span className="splash-pen splash-left">
          <PenSwatch model="reynolds" />
        </span>
        <span className="splash-pen splash-right">
          <PenSwatch model="flamingo" />
        </span>
        <span className="splash-clash">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} className="spark" style={{ '--a': `${i * 36}deg` } as React.CSSProperties} />
          ))}
        </span>
      </span>
      <span className="splash-title" aria-hidden>
        Pen Fight
      </span>
      <span className="splash-tag" aria-hidden>
        Flick. Knock. Win their pen.
      </span>
      <span className="splash-skip" aria-live="polite">
        {loading ? 'Loading the desk…' : 'Tap to start'}
      </span>
    </button>
  );
}
