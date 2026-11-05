import { m, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { BackIcon, DoodleArt, FullscreenIcon, GenreArt, PenFightArt, SoundIcon, MovieArt, WolfRunArt } from './art';
import { GAMES, GENRES, gamesIn, genre as genreOf, type Game, type Genre, type GenreId } from './catalog';
import { canFullscreen, isFullscreen, toggleFullscreen } from './fullscreen';
import { buzz, sfx } from './sfx';
import { asset } from './tier';

const list = { hidden: {}, shown: { transition: { staggerChildren: 0.055, delayChildren: 0.05 } } };
const item = {
  hidden: { opacity: 0, y: 26, scale: 0.94 },
  shown: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 260, damping: 24 } },
} as const;

/** A card that leans towards a mouse pointer in 3D. On touch it just presses in. */
function useTilt(strength: number) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const spring = { stiffness: 220, damping: 20 };
  const rotateX = useSpring(useTransform(y, (v) => -v * strength), spring);
  const rotateY = useSpring(useTransform(x, (v) => v * strength), spring);
  return {
    style: reduced ? {} : { rotateX, rotateY, transformPerspective: 700 },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'mouse') return;
      const r = e.currentTarget.getBoundingClientRect();
      x.set((e.clientX - r.left) / r.width - 0.5);
      y.set((e.clientY - r.top) / r.height - 0.5);
    },
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === 'mouse') sfx.hover();
    },
    onPointerLeave: () => {
      x.set(0);
      y.set(0);
    },
  };
}

function SoundToggle() {
  const [muted, setMuted] = useState(sfx.muted);
  return (
    <button
      type="button"
      className="wp-icon-btn"
      aria-pressed={!muted}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      title={muted ? 'Turn sound on' : 'Turn sound off'}
      onClick={() => {
        sfx.unlock();
        sfx.setMuted(!muted);
        setMuted(!muted);
        if (muted) sfx.tap();
      }}
    >
      <SoundIcon muted={muted} />
    </button>
  );
}

function FullscreenToggle() {
  const [on, setOn] = useState(() => canFullscreen && isFullscreen());
  useEffect(() => {
    const sync = () => setOn(isFullscreen());
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  if (!canFullscreen) return null;
  const label = on ? 'Leave full screen' : 'Go full screen';
  return (
    <button type="button" className="wp-icon-btn" aria-pressed={on} aria-label={label} title={label} onClick={toggleFullscreen}>
      <FullscreenIcon on={on} />
    </button>
  );
}

function TopActions() {
  return (
    <div className="wp-top-actions">
      <FullscreenToggle />
      <SoundToggle />
    </div>
  );
}

function GameCard({ game, onPlay, onWarm }: { game: Game; onPlay: (g: Game) => void; onWarm: (g: Game) => void }) {
  const tilt = useTilt(9);
  return (
    <m.article className="wp-game" variants={item} {...tilt}>
      <div className="wp-game-art">
        {game.id === 'wolf-run' ? (
          <WolfRunArt />
        ) : game.id === 'doodle-rush' ? (
          <DoodleArt />
        ) : game.id === 'guess-movie' ? (
          <MovieArt />
        ) : (
          <PenFightArt />
        )}
      </div>
      <div className="wp-game-body">
        <h3 className="wp-game-title">{game.title}</h3>
        <p className="wp-game-tag">{game.tagline}</p>
        <ul className="wp-facts">
          {game.facts.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
        <m.button
          type="button"
          className="wp-play"
          whileTap={{ scale: 0.95 }}
          onPointerDown={() => onWarm(game)}
          onClick={() => onPlay(game)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <polygon points="6,4 20,12 6,20" fill="currentColor" />
          </svg>
          {game.id === 'pen-fight' ? `Play ${game.title}` : 'Play now'}
        </m.button>
      </div>
    </m.article>
  );
}

/** How long each game stays up, and how long the slider waits after the player touches it. */
const SLIDE_MS = 5000;

/** The featured games: slides by itself, swipes with a finger, and has arrows and dots too. */
function FeaturedSlider({ onPlay, onWarm }: Pick<Common, 'onPlay' | 'onWarm'>) {
  const reduced = useReducedMotion();
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  indexRef.current = index;
  const held = useRef(false);
  const lastTouched = useRef(0);

  const show = (i: number) => {
    const track = trackRef.current;
    if (!track) return;
    const next = (i + GAMES.length) % GAMES.length;
    track.scrollTo({ left: next * track.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
  };

  const byHand = (i: number) => {
    lastTouched.current = Date.now();
    sfx.unlock();
    sfx.tap();
    show(i);
  };

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      if (held.current || document.hidden || Date.now() - lastTouched.current < SLIDE_MS) return;
      show(indexRef.current + 1);
    }, SLIDE_MS);
    return () => window.clearInterval(id);
    // `show` only reads refs and `reduced`.
  }, [reduced]);

  return (
    <section aria-labelledby="wp-featured" aria-roledescription="carousel">
      <m.div className="wp-section-row" variants={item}>
        <h2 id="wp-featured" className="wp-section">
          Featured
        </h2>
        <div className="wp-arrows">
          <button type="button" className="wp-icon-btn" aria-label="Show the previous game" title="Show the previous game" onClick={() => byHand(index - 1)}>
            <BackIcon />
          </button>
          <button type="button" className="wp-icon-btn wp-next" aria-label="Show the next game" title="Show the next game" onClick={() => byHand(index + 1)}>
            <BackIcon />
          </button>
        </div>
      </m.div>
      <div
        ref={trackRef}
        className="wp-slides"
        onScroll={(e) => {
          const t = e.currentTarget;
          setIndex(Math.round(t.scrollLeft / Math.max(1, t.clientWidth)));
        }}
        onPointerEnter={(e) => {
          if (e.pointerType === 'mouse') held.current = true;
        }}
        onPointerLeave={() => {
          held.current = false;
        }}
        onPointerDown={() => {
          lastTouched.current = Date.now();
        }}
        onFocus={() => {
          held.current = true;
        }}
        onBlur={() => {
          held.current = false;
        }}
      >
        {GAMES.map((g, i) => (
          <div key={g.id} className="wp-slide" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${GAMES.length}: ${g.title}`}>
            <GameCard game={g} onPlay={onPlay} onWarm={onWarm} />
          </div>
        ))}
      </div>
      <div className="wp-dots">
        {GAMES.map((g, i) => (
          <button
            key={g.id}
            type="button"
            className={`wp-dot${i === index ? ' is-on' : ''}`}
            aria-label={`Show ${g.title}`}
            aria-current={i === index}
            onClick={() => byHand(i)}
          />
        ))}
      </div>
    </section>
  );
}

function GenreTile({ genre, onOpen }: { genre: Genre; onOpen: (id: GenreId) => void }) {
  const tilt = useTilt(16);
  const count = gamesIn(genre.id).length;
  return (
    <m.div variants={item}>
      <m.button
        type="button"
        layoutId={`genre-${genre.id}`}
        className="wp-tile"
        style={{ '--accent': genre.color, ...tilt.style } as never}
        onPointerMove={tilt.onPointerMove}
        onPointerEnter={tilt.onPointerEnter}
        onPointerLeave={tilt.onPointerLeave}
        whileTap={{ scale: 0.94 }}
        onClick={() => onOpen(genre.id)}
      >
        <span className="wp-tile-art">
          <GenreArt id={genre.id} />
        </span>
        <span className="wp-tile-name">{genre.name}</span>
        <span className={`wp-tile-count${count ? ' has-games' : ''}`}>{count ? `${count} game${count > 1 ? 's' : ''}` : 'Coming soon'}</span>
      </m.button>
    </m.div>
  );
}

interface Common {
  onPlay: (g: Game) => void;
  /** A press on Play: start fetching the game before the tap even lands. */
  onWarm: (g: Game) => void;
  onScroll: (top: number) => void;
  /** The animation code has arrived. Until it has, pages show at once rather than wait hidden. */
  enter: boolean;
}

export function Landing({ onPlay, onWarm, onScroll, enter, onGenre }: Common & { onGenre: (id: GenreId) => void }) {
  return (
    <m.main
      className="wp-page"
      layoutScroll
      onScroll={(e) => onScroll(e.currentTarget.scrollTop)}
      initial={enter ? 'hidden' : false}
      animate="shown"
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      variants={list}
    >
      <div className="wp-wrap">
        <m.header className="wp-top" variants={item}>
          <img className="wp-top-logo" src={asset('brand/wildplayers-logo.webp')} alt="WildPlayers" width={947} height={610} />
          <TopActions />
        </m.header>
        <m.h1 className="wp-hero-title" variants={item}>
          Pick a game. <em>Go wild.</em>
        </m.h1>

        <FeaturedSlider onPlay={onPlay} onWarm={onWarm} />

        <section aria-labelledby="wp-genres">
          <m.h2 id="wp-genres" className="wp-section" variants={item}>
            Genres
          </m.h2>
          <div className="wp-tiles">
            {GENRES.map((g) => (
              <GenreTile key={g.id} genre={g} onOpen={onGenre} />
            ))}
          </div>
        </section>
      </div>
    </m.main>
  );
}

export function GenrePage({ id, onPlay, onWarm, onScroll, enter, onBack }: Common & { id: GenreId; onBack: () => void }) {
  const genre = genreOf(id);
  const games = gamesIn(id);
  return (
    <m.main
      className="wp-page"
      layoutScroll
      style={{ '--accent': genre.color } as React.CSSProperties}
      onScroll={(e) => onScroll(e.currentTarget.scrollTop)}
      initial={enter ? 'hidden' : false}
      animate="shown"
      exit={{ opacity: 0, transition: { duration: 0.18 } }}
      variants={list}
    >
      <div className="wp-wrap">
        <m.header className="wp-top" variants={item}>
          <button type="button" className="wp-icon-btn" aria-label="Go back to all genres" title="Go back to all genres" onClick={onBack}>
            <BackIcon />
          </button>
          <TopActions />
        </m.header>
        <m.div layoutId={`genre-${id}`} className="wp-banner">
          <span className="wp-banner-art">
            <GenreArt id={id} />
          </span>
          <span>
            <h1 className="wp-banner-title">{genre.name}</h1>
            <p className="wp-banner-tag">{genre.tagline}</p>
          </span>
        </m.div>

        {games.length > 0 ? (
          <section aria-label={`${genre.name} games`} className="wp-games">
            {games.map((g, i) => (
              <div key={g.id}>
                {g.shelf?.genre === id && games[i - 1]?.shelf?.name !== g.shelf.name && (
                  <m.div className="wp-shelf" variants={item}>
                    <h2 className="wp-shelf-name">{g.shelf.name}</h2>
                    <p className="wp-banner-tag">{g.shelf.tagline}</p>
                  </m.div>
                )}
                <GameCard game={g} onPlay={onPlay} onWarm={onWarm} />
              </div>
            ))}
          </section>
        ) : (
          <m.section className="wp-empty" variants={item}>
            <h2 className="wp-empty-title">No {genre.name.toLowerCase()} games yet</h2>
            <p>This shelf is being built. Pen Fight is ready to play right now.</p>
            <m.button
              type="button"
              className="wp-play"
              whileTap={{ scale: 0.95 }}
              onPointerDown={() => onWarm(GAMES[0])}
              onClick={() => onPlay(GAMES[0])}
            >
              Play {GAMES[0].title}
            </m.button>
          </m.section>
        )}
      </div>
    </m.main>
  );
}

/** A tap that opens or goes back: sound, a small buzz. */
export function feedback(kind: 'open' | 'back'): void {
  sfx.unlock();
  sfx[kind]();
  buzz(12);
}
