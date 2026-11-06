import { m } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackIcon } from '../platform/art';
import { autoFullscreen } from '../platform/fullscreen';
import { isAway } from '../platform/lifecycle';
import { buzz, sfx } from '../platform/sfx';
import {
  EXTRA_SECONDS,
  LEVELS,
  LIVES,
  ROUNDS,
  UPCOMING,
  afterDaily,
  dailyRound,
  dayKey,
  halfOf,
  isOpen,
  lifelinesFor,
  newLevel,
  pointsFor,
  rankFor,
  starsFor,
  totalStars,
  type Daily,
  type Level,
  type Lifeline,
  type Progress,
  type Round,
} from './game';
import { LANGUAGES, TELUGU_MOVIES, type Language } from './movies';
import './movieGame.css';

const PROGRESS_KEY = 'wildplayers:guess-movie-levels';
const DAILY_KEY = 'wildplayers:guess-movie-daily';
const LIFELINE_NAMES: Record<Lifeline, string> = { half: '50:50', time: `+${EXTRA_SECONDS} sec`, reveal: 'Show all' };
/** The rules for Movie of the Day: one calm question, no help. */
const DAILY_LEVEL: Level = { id: 0, name: 'Movie of the Day', tagline: '', seconds: null, revealEvery: null, clue: false, choices: 4, movies: [] };
/** The clock ticks aloud for its last few seconds. */
const TICK_FROM_S = 5;

function readProgress(): Progress {
  try {
    return (JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? '{}') as Progress) ?? {};
  } catch {
    return {};
  }
}

function readDaily(): Daily | null {
  try {
    return JSON.parse(localStorage.getItem(DAILY_KEY) ?? 'null') as Daily | null;
  } catch {
    return null;
  }
}

function saveDaily(daily: Daily): void {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(daily));
  } catch {
    // Remembering is only a convenience.
  }
}

/** Sends a score to friends, or copies it where sharing isn't available. Returns what happened. */
async function shareScore(text: string): Promise<string | null> {
  const url = `${location.origin}${location.pathname}#/play/guess-movie`;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Guess the Movie Title', text, url });
      return null;
    }
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'Copied. Paste it to your friends.';
  } catch {
    return null;
  }
}

/** A burst of paper for a right answer. */
function Confetti({ count = 18 }: { count?: number }) {
  const colors = ['#ff6a13', '#ffc21a', '#37c871', '#57b8f2', '#e84f9c'];
  return (
    <div className="mg-confetti" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colors[i % colors.length], animationDelay: `${(i % 6) * 40}ms`, ['--drift' as string]: `${((i * 53) % 90) - 45}px` }} />
      ))}
    </div>
  );
}

function saveProgress(progress: Progress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Remembering is only a convenience.
  }
}

interface Playing {
  kind: 'round';
  level: Level;
  rounds: Round[];
  index: number;
  score: number;
  right: number;
  streak: number;
  lives: number;
  /** Lifelines not yet used on this run. */
  helps: Lifeline[];
}

interface Finished {
  kind: 'done';
  level: Level;
  score: number;
  right: number;
  stars: number;
  isBest: boolean;
}

type Screen = { kind: 'language' } | { kind: 'levels' } | Playing | Finished | { kind: 'daily'; round: Round };

/** Guess the Movie Title: pick a language, then climb the levels naming movies from a few little pictures. */
export default function MovieGame({ onExit }: { onExit: () => void }) {
  const [screen, setScreen] = useState<Screen>({ kind: 'language' });
  const [progress, setProgress] = useState<Progress>(readProgress);
  const [daily, setDaily] = useState<Daily | null>(readDaily);

  const play = (level: Level) => {
    sfx.unlock();
    sfx.launch();
    setScreen({ kind: 'round', level, rounds: newLevel(level, TELUGU_MOVIES), index: 0, score: 0, right: 0, streak: 0, lives: LIVES, helps: lifelinesFor(level) });
  };

  const finish = (game: Playing, score: number, right: number) => {
    const stars = starsFor(right);
    const was = progress[game.level.id];
    const isBest = score > (was?.best ?? 0);
    const next = { ...progress, [game.level.id]: { stars: Math.max(stars, was?.stars ?? 0), best: Math.max(score, was?.best ?? 0) } };
    setProgress(next);
    saveProgress(next);
    setScreen({ kind: 'done', level: game.level, score, right, stars, isBest });
  };

  const next = (points: number, wasRight: boolean) => {
    if (screen.kind !== 'round') return;
    const score = screen.score + points;
    const right = screen.right + (wasRight ? 1 : 0);
    const lives = screen.lives - (wasRight ? 0 : 1);
    if (lives <= 0 || screen.index + 1 >= screen.rounds.length) {
      finish(screen, score, right);
      return;
    }
    setScreen({ ...screen, index: screen.index + 1, score, right, lives, streak: wasRight ? screen.streak + 1 : 0 });
  };

  const back = () => {
    sfx.back();
    if (screen.kind === 'language') onExit();
    else if (screen.kind === 'levels') setScreen({ kind: 'language' });
    else setScreen({ kind: 'levels' });
  };

  const backLabel = screen.kind === 'language' ? 'Go back to Office' : screen.kind === 'levels' ? 'Go back to languages' : 'Go back to the levels';

  return (
    <div className="wp-root mg-root">
      <main className="wp-page">
        <div className="wp-wrap mg-wrap">
          <header className="wp-top mg-top">
            <button type="button" className="wp-icon-btn" aria-label={backLabel} title={backLabel} onClick={back}>
              <BackIcon />
            </button>
            {screen.kind === 'round' ? (
              <div className="mg-progress">
                <span className="mg-progress-level">Level {screen.level.id}</span>
                <span className="mg-lives" aria-label={`${screen.lives} of ${LIVES} lives left`}>
                  {Array.from({ length: LIVES }, (_, i) => (
                    <i key={i} className={i < screen.lives ? 'is-on' : ''} aria-hidden />
                  ))}
                </span>
                <strong>{screen.score}</strong>
              </div>
            ) : (
              <p className="mg-name">Guess the Movie Title</p>
            )}
          </header>

          {screen.kind === 'language' && (
            <LanguagePick
              onStart={() => {
                sfx.open();
                setScreen({ kind: 'levels' });
              }}
            />
          )}
          {screen.kind === 'levels' && (
            <LevelMap
              progress={progress}
              daily={daily}
              onPlay={play}
              onDaily={() => {
                sfx.unlock();
                sfx.open();
                setScreen({ kind: 'daily', round: dailyRound(dayKey(new Date()), TELUGU_MOVIES) });
              }}
            />
          )}
          {screen.kind === 'daily' && (
            <RoundView
              level={DAILY_LEVEL}
              round={screen.round}
              number={1}
              streak={0}
              lastLife={false}
              last
              helps={[]}
              onHelp={() => {}}
              onAnswer={(right) => {
                const next = afterDaily(daily, dayKey(new Date()), right);
                setDaily(next);
                saveDaily(next);
              }}
              onNext={() => setScreen({ kind: 'levels' })}
            />
          )}
          {screen.kind === 'round' && (
            <RoundView
              key={screen.index}
              level={screen.level}
              round={screen.rounds[screen.index]}
              number={screen.index + 1}
              streak={screen.streak}
              lastLife={screen.lives === 1}
              last={screen.index + 1 === screen.rounds.length}
              helps={screen.helps}
              onHelp={(help) => setScreen({ ...screen, helps: screen.helps.filter((h) => h !== help) })}
              onNext={next}
            />
          )}
          {screen.kind === 'done' && (
            <Results
              {...screen}
              onAgain={() => play(screen.level)}
              onNext={LEVELS.find((l) => l.id === screen.level.id + 1) && screen.stars > 0 ? () => play(LEVELS[screen.level.id]) : undefined}
              onLevels={() => {
                sfx.back();
                setScreen({ kind: 'levels' });
              }}
            />
          )}
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
      <p className="mg-lead">A few little pictures point to a movie. Name it, and climb six levels of ten movies, each harder than the last.</p>
      <div className="mg-langs">
        {LANGUAGES.map((l) => (
          <m.button key={l.id} type="button" className={`mg-lang${l.ready ? '' : ' is-soon'}`} whileTap={{ scale: 0.96 }} onClick={() => pick(l)}>
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

function Stars({ count }: { count: number }) {
  return (
    <span className="mg-stars" role="img" aria-label={`${count} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={i < count ? 'is-won' : ''}>
          ★
        </span>
      ))}
    </span>
  );
}

/** The climb: six levels to play, each opened by the one before, then the ones still to come. */
function LevelMap({ progress, daily, onPlay, onDaily }: { progress: Progress; daily: Daily | null; onPlay: (level: Level) => void; onDaily: () => void }) {
  const [note, setNote] = useState<string | null>(null);
  const stars = totalStars(progress);
  const playedToday = daily?.day === dayKey(new Date());
  return (
    <section className="mg-panel" aria-label="Levels">
      <div className="mg-rank">
        <div>
          <p className="mg-rank-label">Your rank</p>
          <h1 className="mg-title">{rankFor(stars)}</h1>
        </div>
        <p className="mg-rank-stars">
          <span>★</span> {stars} of {LEVELS.length * 3}
        </p>
      </div>
      {playedToday ? (
        <p className="mg-daily is-done">
          <strong>Movie of the Day: done</strong>
          <small>
            {daily?.right ? 'You got it.' : 'Not today.'} {daily?.streak} day{daily?.streak === 1 ? '' : 's'} in a row. A new one tomorrow.
          </small>
        </p>
      ) : (
        <button type="button" className="mg-daily" onClick={onDaily}>
          <strong>Movie of the Day</strong>
          <small>One puzzle, the same for everyone. Come back daily.</small>
        </button>
      )}
      <ol className="mg-levels">
        {LEVELS.map((level, i) => {
          const open = isOpen(progress, level.id);
          const done = progress[level.id];
          return (
            <li key={level.id} className="mg-rise" style={{ animationDelay: `${i * 50}ms` }}>
              <button
                type="button"
                className={`mg-level${open ? '' : ' is-locked'}`}
                aria-disabled={!open}
                onClick={() => {
                  if (open) {
                    onPlay(level);
                    return;
                  }
                  sfx.back();
                  setNote(`Get at least 6 right on level ${level.id - 1} to open level ${level.id}.`);
                }}
              >
                <span className="mg-level-number">{level.id}</span>
                <span className="mg-level-text">
                  <strong>{level.name}</strong>
                  <small>{open ? level.tagline : `Clear level ${level.id - 1} to open`}</small>
                </span>
                {open && <Stars count={done?.stars ?? 0} />}
              </button>
            </li>
          );
        })}
      </ol>
      {note && (
        <p className="mg-note" role="status">
          {note}
        </p>
      )}
      <p className="mg-rank-label">Coming soon</p>
      <ul className="mg-upcoming">
        {UPCOMING.map((id) => (
          <li key={id}>
            <strong>{id}</strong>
            <small>Upcoming</small>
          </li>
        ))}
      </ul>
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

interface RoundProps {
  level: Level;
  round: Round;
  number: number;
  streak: number;
  lastLife: boolean;
  last: boolean;
  helps: Lifeline[];
  onHelp: (help: Lifeline) => void;
  onAnswer?: (right: boolean) => void;
  onNext: (points: number, right: boolean) => void;
}

function RoundView({ level, round, number, streak, lastLife, last, helps, onHelp, onAnswer, onNext }: RoundProps) {
  const { movie, choices } = round;
  const [picked, setPicked] = useState<string | null>(null);
  const [clue, setClue] = useState(false);
  const [big, setBig] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [earned, setEarned] = useState(0);
  const [removed, setRemoved] = useState<string[]>([]);
  const [extra, setExtra] = useState(0);
  const [allShown, setAllShown] = useState(false);
  const elapsedRef = useRef(0);
  const decided = useRef(false);
  const closeBig = useCallback(() => {
    sfx.back();
    setBig(false);
  }, []);
  const answered = picked !== null;
  const right = picked === movie.id;
  const timesUp = picked === '';
  const total = level.seconds === null ? null : level.seconds + extra;
  const left = total === null ? null : Math.max(0, total - elapsed);

  const answer = useCallback(
    (id: string) => {
      if (decided.current) return;
      decided.current = true;
      const isRight = id === movie.id;
      const share = total === null ? 0 : Math.max(0, 1 - elapsedRef.current / total);
      setEarned(pointsFor(isRight, clue, share, streak + 1));
      setPicked(id);
      onAnswer?.(isRight);
      if (isRight) {
        sfx.right();
        buzz(25);
      } else {
        sfx.wrong();
        buzz(90);
      }
    },
    [movie.id, total, clue, streak, onAnswer],
  );

  // The clock also brings on the pictures.
  useEffect(() => {
    if (answered || (level.seconds === null && level.revealEvery === null)) return;
    let before = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const gap = (now - before) / 1000;
      before = now;
      // The clock stops while the player's away, for a call or anything else.
      if (isAway()) return;
      const t = elapsedRef.current + Math.min(gap, 0.5);
      elapsedRef.current = t;
      setElapsed(t);
      if (total !== null && t >= total) answer('');
    }, 100);
    return () => window.clearInterval(id);
  }, [answered, total, level.revealEvery, answer]);

  const secondsLeft = left === null ? null : Math.ceil(left);
  useEffect(() => {
    if (secondsLeft !== null && !answered && secondsLeft > 0 && secondsLeft <= TICK_FROM_S) sfx.hover();
  }, [secondsLeft, answered]);

  const useHelp = (help: Lifeline) => {
    if (answered) return;
    sfx.open();
    buzz(15);
    onHelp(help);
    if (help === 'half') setRemoved(halfOf(round));
    else if (help === 'time') setExtra((s) => s + EXTRA_SECONDS);
    else setAllShown(true);
  };

  const shown = answered || allShown || level.revealEvery === null ? movie.items.length : Math.min(movie.items.length, 1 + Math.floor(elapsed / level.revealEvery));
  const visible = movie.items.slice(0, shown);

  return (
    <section className="mg-round" aria-label="Guess this movie">
      <div className="mg-round-head">
        <span>
          Movie {number} of {ROUNDS}
        </span>
        {streak >= 2 && <strong className="mg-streak">{streak} in a row</strong>}
        {lastLife && !answered && <strong className="mg-danger">Last life</strong>}
      </div>
      {left !== null && (
        <div className={`mg-clock${left <= TICK_FROM_S ? ' is-low' : ''}`} role="timer" aria-label={`${secondsLeft} seconds left`}>
          <span style={{ transform: `scaleX(${left / (total ?? 1)})` }} />
          <b>{secondsLeft}</b>
        </div>
      )}
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
        <div className="mg-items" role="img" aria-label={`Picture puzzle: ${visible.join(' ')}`}>
          {movie.items.map((item, i) =>
            i < shown ? (
              <span key={i} className="mg-item mg-pop" style={{ animationDelay: level.revealEvery === null ? `${i * 120}ms` : undefined }}>
                {item}
              </span>
            ) : (
              <span key={i} className="mg-item mg-item-hidden" aria-hidden>
                ?
              </span>
            ),
          )}
        </div>
        <p className="mg-tag">#GUESSTHEMOVIE</p>
      </div>
      {big && <BigPicture items={visible} onClose={closeBig} />}

      {level.clue && (
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
      )}

      {helps.length > 0 && !answered && (
        <div className="mg-helps" role="group" aria-label="Lifelines, one use each per level">
          {helps.map((help) => (
            <button key={help} type="button" className="mg-help" onClick={() => useHelp(help)}>
              {LIFELINE_NAMES[help]}
            </button>
          ))}
        </div>
      )}

      <div className="mg-choices">
        {choices.map((c) => {
          const gone = removed.includes(c.id) && !answered;
          const state = gone ? ' is-gone' : !answered ? '' : c.id === movie.id ? ' is-right' : c.id === picked ? ' is-wrong' : ' is-out';
          return (
            <m.button key={c.id} type="button" className={`mg-choice${state}`} whileTap={answered ? undefined : { scale: 0.96 }} aria-disabled={answered || gone} onClick={() => !gone && answer(c.id)}>
              <span className="mg-choice-title">{c.title}</span>
              <span className="mg-choice-local">{c.local}</span>
            </m.button>
          );
        })}
      </div>

      {answered && (
        <div className="mg-result mg-rise" role="status">
            {right && <Confetti />}
            <p className="mg-verdict">
              <strong>{right ? (level.id === 0 ? 'You got it!' : `Right! +${earned}`) : timesUp ? 'Time’s up.' : 'Not this time.'}</strong> {movie.title} ({movie.year})
            </p>
            <p className="mg-story">{movie.clue}</p>
            <button
              type="button"
              className="wp-play"
              autoFocus
              onClick={() => {
                sfx.tap();
                onNext(earned, right);
              }}
            >
              {level.id === 0 ? 'Back to the levels' : last || (lastLife && !right) ? 'See how you did' : 'Next movie'}
            </button>
        </div>
      )}
    </section>
  );
}

interface ResultsProps {
  level: Level;
  score: number;
  right: number;
  stars: number;
  isBest: boolean;
  onAgain: () => void;
  onNext?: () => void;
  onLevels: () => void;
}

function Results({ level, score, right, stars, isBest, onAgain, onNext, onLevels }: ResultsProps) {
  const passed = stars > 0;
  useEffect(() => {
    if (passed) sfx.launch();
    else sfx.wrong();
  }, [passed]);
  const finale = passed && level.id === LEVELS.length;
  const opened = passed && !finale ? LEVELS[level.id] : null;
  const [note, setNote] = useState<string | null>(null);
  return (
    <section className="mg-panel mg-done">
      <p className="mg-rank-label">
        Level {level.id}: {level.name}
      </p>
      {right === ROUNDS && <Confetti count={30} />}
      <h1 className="mg-title">{right === ROUNDS ? 'Perfect!' : finale ? 'All levels cleared!' : passed ? 'Level cleared!' : 'So close'}</h1>
      <div className="mg-big-stars" role="img" aria-label={`${stars} of 3 stars`}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`mg-pop${i < stars ? ' is-won' : ''}`} style={{ animationDelay: `${250 + i * 220}ms` }}>
            ★
          </span>
        ))}
      </div>
      <p className="mg-score">{score}</p>
      <p className="mg-lead">
        {right} of {ROUNDS} right{isBest ? '. Your best on this level!' : '.'}
        {!passed && ' Get 6 right to open the next level.'}
        {opened && ` Level ${opened.id} is open: ${opened.name}.`}
      </p>
      <button
        type="button"
        className="mg-clue-btn mg-share"
        onClick={() => {
          sfx.tap();
          void shareScore(`I got ${right} of ${ROUNDS} on level ${level.id} of Guess the Movie Title. Can you beat ${score}?`).then(setNote);
        }}
      >
        Challenge your friends
      </button>
      {note && (
        <p className="mg-note" role="status">
          {note}
        </p>
      )}
      {onNext && (
        <button type="button" className="wp-play" onClick={onNext}>
          Next level
        </button>
      )}
      <button type="button" className={onNext ? 'mg-clue-btn' : 'wp-play'} onClick={onAgain}>
        {passed ? 'Play again' : 'Try again'}
      </button>
      <button type="button" className="mg-clue-btn" onClick={onLevels}>
        All levels
      </button>
    </section>
  );
}
