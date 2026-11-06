import { animate } from 'motion/mini';
import { useEffect, useRef } from 'react';

interface Props {
  /** Whatever comes next is ready: tear the splash open. */
  leaving: boolean;
  /** Motion is unwelcome here, so everything simply shows. */
  still: boolean;
  onGone: () => void;
}

const CLAWS = [
  'M52 6C50 70 34 134 8 194C48 146 70 78 72 10Z',
  'M92 2C90 70 74 138 48 198C88 150 110 78 112 6Z',
  'M132 10C130 70 114 130 90 186C126 142 148 78 150 14Z',
];
const WORDS = 'GET READY';
const SNAP = [0.7, 0, 0.2, 1] as const;
const OPEN_MS = 620;

/**
 * The first thing on screen: three claw marks rip down the dark, the words land,
 * the bar fills, and the screen tears open along a diagonal onto what's next.
 * The logo isn't here, because it belongs to the film's reveal.
 */
export function Splash({ leaving, still, onGone }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const q = <T extends Element>(selector: string) => [...(rootRef.current?.querySelectorAll<T>(selector) ?? [])];

  useEffect(() => {
    if (still) return;
    q('.wp-claw').forEach((claw, i) => {
      animate(claw, { transform: ['scaleY(0)', 'scaleY(1)'], opacity: [0, 1] }, { duration: 0.24, delay: 0.12 + i * 0.1, ease: SNAP });
    });
    q('.wp-splash-mark').forEach((mark) => animate(mark, { transform: ['scale(1)', 'scale(1.14)', 'scale(1)'] }, { duration: 0.34, delay: 0.42 }));
    q('.wp-splash-flash').forEach((flash) => animate(flash, { opacity: [0.5, 0] }, { duration: 0.4, delay: 0.42 }));
    q('.wp-splash-word span').forEach((letter, i) => {
      animate(letter, { transform: ['translateY(120%)', 'translateY(0)'], opacity: [0, 1] }, { duration: 0.32, delay: 0.56 + i * 0.035, ease: SNAP });
    });
    q('.wp-splash-fill').forEach((fill) => animate(fill, { transform: ['scaleX(0)', 'scaleX(0.9)'] }, { duration: 1.3, delay: 0.5, ease: 'easeOut' }));
    // Runs once, on arrival.
  }, []);

  useEffect(() => {
    if (!leaving) return;
    if (still) {
      onGone();
      return;
    }
    q('.wp-splash-fill').forEach((fill) => animate(fill, { transform: 'scaleX(1)' }, { duration: 0.14 }));
    q('.wp-splash-content').forEach((content) => animate(content, { opacity: 0, transform: 'scale(1.18)' }, { duration: 0.26, delay: 0.12 }));
    const [left, right] = q('.wp-splash-half');
    animate(left, { transform: 'translateX(-72%)' }, { duration: 0.46, delay: 0.16, ease: SNAP });
    animate(right, { transform: 'translateX(72%)' }, { duration: 0.46, delay: 0.16, ease: SNAP });
    const id = window.setTimeout(onGone, OPEN_MS);
    return () => window.clearTimeout(id);
    // The parent's callback isn't a reason to tear again.
  }, [leaving, still]);

  return (
    <div ref={rootRef} className={`wp-splash${still ? ' is-still' : ''}`} role="status" aria-label="Loading WildPlayers">
      <span className="wp-splash-half" aria-hidden />
      <span className="wp-splash-half is-right" aria-hidden />
      <span className="wp-splash-flash" aria-hidden />
      <div className="wp-splash-content" aria-hidden>
        <svg className="wp-splash-mark" viewBox="0 0 160 200">
          {CLAWS.map((d) => (
            <path key={d} className="wp-claw" d={d} />
          ))}
        </svg>
        <p className="wp-splash-word">
          {[...WORDS].map((c, i) => (
            <span key={i}>{c === ' ' ? ' ' : c}</span>
          ))}
        </p>
        <span className="wp-splash-bar">
          <i className="wp-splash-fill" />
        </span>
      </div>
    </div>
  );
}
