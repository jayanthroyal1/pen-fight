import { AnimatePresence, m } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { BackIcon } from '../platform/art';
import { autoFullscreen } from '../platform/fullscreen';
import { buzz, sfx } from '../platform/sfx';
import { POINTS, ROUNDS, newGame, pointsFor, type Round } from './game';
import { LANGUAGES, TELUGU_MOVIES, type Language } from './movies';
import './movieGame.css';

const BEST_KEY = 'wildplayers:guess-movie-best';

function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(score: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(score));
  } catch {
    // Remembering is only a convenience.
  }
}

type Screen = { kind: 'language' } | { kind: 'round'; rounds: Round[]; index: number; score: number } | { kind: 'done'; score: number; best: number; isBest: boolean };

/** Guess the Movie Title: pick a language, then name the movie from a few little pictures. */
export default function MovieGame({ onExit }: { onExit: () => void }) {
  const [screen, setScreen] = useState<Screen>({ kind: 'language' });

  const start = () => {
    sfx.unlock();
    sfx.launch();
    setScreen({ kind: 'round', rounds: newGame(TELUGU_MOVIES), index: 0, score: 0 });
  };

  const next = (score: number) => {
    if (screen.kind !== 'round') return;
    if (screen.index + 1 < screen.rounds.length) {
      setScreen({ ...screen, index: screen.index + 1, score });
      return;
    }
    const best = readBest();
    if (score > best) saveBest(score);
    setScreen({ kind: 'done', score, best: Math.max(best, score), isBest: score > best });
  };

  return (
    <div className="wp-root mg-root">
      <main className="wp-page">
        <div className="wp-wrap mg-wrap">
          <header className="wp-top mg-top">
            <button
              type="button"
              className="wp-icon-btn"
              aria-label="Go back to Office"
              title="Go back to Office"
              onClick={() => {
                sfx.back();
                onExit();
              }}
            >
              <BackIcon />
            </button>
            {screen.kind === 'round' ? (
              <p className="mg-progress">
                <span>
                  Movie {screen.index + 1} of {screen.rounds.length}
                </span>
                <strong>{screen.score} pts</strong>
              </p>
            ) : (
              <p className="mg-name">Guess the Movie Title</p>
            )}
          </header>

          {screen.kind === 'language' && <LanguagePick onStart={start} />}
          {screen.kind === 'round' && (
            <RoundView
              key={screen.index}
              round={screen.rounds[screen.index]}
              last={screen.index + 1 === screen.rounds.length}
              onNext={(points) => next(screen.score + points)}
            />
          )}
          {screen.kind === 'done' && <Results {...screen} onAgain={start} onExit={onExit} />}
        </div>
      </main>
    </div>
  );
}

function LanguagePick({ onStart }: { onStart: () => void }) {
  const [note, setNote] = useState<string | null>(null);
  const pick = (l: Language) => {
    sfx.unlock();
    if (l.ready) {
      onStart();
      return;
    }
    sfx.back();
    setNote(`${l.name} movies are coming soon. Telugu is ready to play.`);
  };
  return (
    <section className="mg-panel">
      <h1 className="mg-title">Pick a language</h1>
      <p className="mg-lead">
        A few little pictures point to a movie. Pick its title from four. {ROUNDS} movies, {POINTS} points each.
      </p>
      <div className="mg-langs">
        {LANGUAGES.map((l) => (
          <m.button
            key={l.id}
            type="button"
            className={`mg-lang${l.ready ? '' : ' is-soon'}`}
            whileTap={{ scale: 0.96 }}
            onClick={() => pick(l)}
          >
            <span className="mg-lang-local">{l.local}</span>
            <span className="mg-lang-name">{l.name}</span>
            <span className="mg-lang-tag">{l.ready ? 'Play now' : 'Coming soon'}</span>
          </m.button>
        ))}
      </div>
      {note && (
        <p className="mg-note" role="status">
          {note}
        </p>
      )}
    </section>
  );
}

/**
 * The puzzle alone, as big as the screen goes, to hold up for teammates: no
 * titles, no clue. It follows the phone's turn, and Turn does the same for a
 * phone with its rotation locked.
 */
function BigPicture({ items, onClose }: { items: string[]; onClose: () => void }) {
  const [turned, setTurned] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="mg-big" role="dialog" aria-modal="true" aria-label="The picture puzzle, full screen">
      <div className={`mg-big-sheet${turned ? ' is-turned' : ''}`} style={{ '--n': items.length } as React.CSSProperties}>
        <div className="mg-big-items" role="img" aria-label={`Picture puzzle: ${items.join(' ')}`}>
          {items.map((item, i) => (
            <span key={i} className="mg-big-item" style={{ animationDelay: `${i * 90}ms` }}>
              {item}
            </span>
          ))}
        </div>
        <p className="mg-tag mg-big-tag">#GUESSTHEMOVIE</p>
      </div>
      <div className="mg-big-tools">
        <button
          type="button"
          className="mg-big-btn"
          aria-pressed={turned}
          aria-label="Turn the picture"
          title="Turn the picture"
          onClick={() => {
            sfx.tap();
            setTurned((t) => !t);
          }}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
            <path d="M20 12a8 8 0 1 1-2.6-5.9M20 3v5h-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className="mg-big-btn" aria-label="Close the full screen picture" title="Close" autoFocus onClick={onClose}>
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function RoundView({ round, last, onNext }: { round: Round; last: boolean; onNext: (points: number) => void }) {
  const { movie, choices } = round;
  const [picked, setPicked] = useState<string | null>(null);
  const [clue, setClue] = useState(false);
  const [big, setBig] = useState(false);
  const closeBig = useCallback(() => {
    sfx.back();
    setBig(false);
  }, []);
  const answered = picked !== null;
  const right = picked === movie.id;

  const answer = (id: string) => {
    if (answered) return;
    setPicked(id);
    if (id === movie.id) {
      sfx.right();
      buzz(25);
    } else {
      sfx.wrong();
      buzz(90);
    }
  };

  return (
    <section className="mg-round" aria-label="Guess this movie">
      <div className="mg-card">
        <button
          type="button"
          className="mg-expand"
          onClick={() => {
            sfx.tap();
            autoFullscreen();
            setBig(true);
          }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" />
          </svg>
          Full screen
        </button>
        <div className="mg-items" role="img" aria-label={`Picture puzzle: ${movie.items.join(' ')}`}>
          {movie.items.map((item, i) => (
            <m.span
              key={i}
              className="mg-item"
              initial={{ opacity: 0, scale: 0.4, rotate: -14 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 16, delay: i * 0.12 }}
            >
              {item}
            </m.span>
          ))}
        </div>
        <p className="mg-tag">#GUESSTHEMOVIE</p>
      </div>
      {big && <BigPicture items={movie.items} onClose={closeBig} />}

      <div className="mg-clue-row">
        {clue ? (
          <p className="mg-clue">{movie.clue}</p>
        ) : (
          !answered && (
            <button
              type="button"
              className="mg-clue-btn"
              onClick={() => {
                sfx.tap();
                setClue(true);
              }}
            >
              Show a clue (half points)
            </button>
          )
        )}
      </div>

      <div className="mg-choices">
        {choices.map((c) => {
          const state = !answered ? '' : c.id === movie.id ? ' is-right' : c.id === picked ? ' is-wrong' : ' is-out';
          return (
            <m.button key={c.id} type="button" className={`mg-choice${state}`} whileTap={answered ? undefined : { scale: 0.96 }} aria-disabled={answered} onClick={() => answer(c.id)}>
              <span className="mg-choice-title">{c.title}</span>
              <span className="mg-choice-local">{c.local}</span>
            </m.button>
          );
        })}
      </div>

      <AnimatePresence>
        {answered && (
          <m.div className="mg-result" role="status" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <p className="mg-verdict">
              <strong>{right ? `Right! +${pointsFor(true, clue)}` : 'Not this time.'}</strong> {movie.title} ({movie.year})
            </p>
            <button
              type="button"
              className="wp-play"
              autoFocus
              onClick={() => {
                sfx.tap();
                onNext(pointsFor(right, clue));
              }}
            >
              {last ? 'See my score' : 'Next movie'}
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function Results({ score, best, isBest, onAgain, onExit }: { score: number; best: number; isBest: boolean; onAgain: () => void; onExit: () => void }) {
  useEffect(() => {
    sfx.right();
  }, []);
  return (
    <m.section className="mg-panel mg-done" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <h1 className="mg-title">{isBest ? 'New best score!' : 'Game over'}</h1>
      <p className="mg-score">
        {score} <span>of {ROUNDS * POINTS}</span>
      </p>
      <p className="mg-lead">Your best: {best}</p>
      <button type="button" className="wp-play" onClick={onAgain}>
        Play again
      </button>
      <button type="button" className="mg-clue-btn" onClick={onExit}>
        Go back to Office
      </button>
    </m.section>
  );
}
