import { AnimatePresence, LazyMotion, MotionConfig, m } from 'motion/react';
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { BRAND_ORANGE, genre as genreOf, type Game, type GameId, type GenreId } from './catalog';
import { autoFullscreen } from './fullscreen';
import { Intro } from './Intro';
import { Recover } from './Recover';
import { GenrePage, Landing, feedback } from './Pages';
import { openingRoute, parseRoute, routeHash, type Route } from './routes';
import { buzz, sfx } from './sfx';
import type { PlatformStage } from './stage';
import { asset, stageTier } from './tier';

/** Animation code arrives after the first paint; until then pages simply appear. */
const loadMotion = () => import('./motionFeatures').then((f) => f.default);
const loadPenFight = () => import('../PenFightGame');
const loadGuessMovie = () => import('../movieGame/MovieGame');
const loadDoodleRush = () => import('../drawGame/DrawGame');
const loadWolfRun = () => import('../runnerGame/WolfRun');
const loadSwordFight = () => import('../swordGame/SwordGame');
const loadBladeRift = () => import('../bladeGame/BladeGame');
const PenFightGame = lazy(loadPenFight);
const MovieGame = lazy(loadGuessMovie);
const DrawGame = lazy(loadDoodleRush);
const WolfRun = lazy(loadWolfRun);
const SwordGame = lazy(loadSwordFight);
const BladeGame = lazy(loadBladeRift);
const loaders: Record<GameId, () => Promise<unknown>> = {
  'pen-fight': loadPenFight,
  'guess-movie': loadGuessMovie,
  'doodle-rush': loadDoodleRush,
  'wolf-run': loadWolfRun,
  'sword-fight': loadSwordFight,
  'blade-rift': loadBladeRift,
};

/** The wipe's shortest run, so a fast load still reads as a transition. */
const WIPE_MS = 620;

/**
 * Loads the 3D background into `host` while `active`, and frees it otherwise: a
 * game needs the phone's graphics memory for itself. Devices that can't or
 * shouldn't run it keep the CSS background, and everything still works.
 */
function useStage(host: React.RefObject<HTMLDivElement | null>, active: boolean) {
  const [stage, setStage] = useState<PlatformStage | null>(null);
  useEffect(() => {
    if (!active) return;
    const tier = stageTier();
    if (tier === 'off') return;
    let cancelled = false;
    let made: PlatformStage | null = null;
    const canvas = document.createElement('canvas');
    canvas.className = 'wp-stage';
    host.current?.append(canvas);
    void (async () => {
      try {
        const { PlatformStage } = await import('./stage');
        if (cancelled) return;
        made = new PlatformStage(canvas, tier, asset('brand/wildplayers-logo.webp'));
        await made.ready;
        if (!cancelled) setStage(made);
      } catch {
        // No WebGL, or the chunk failed to load: the CSS background stays.
        canvas.remove();
      }
    })();
    return () => {
      cancelled = true;
      setStage(null);
      made?.dispose();
      canvas.remove();
    };
  }, [host, active]);
  return stage;
}

/** The WildPlayers shell: the intro, the landing page and genres, and starting a game. */
export function Platform() {
  const [route, setRoute] = useState<Route>(() => openingRoute(location.search, location.hash));
  // The intro is for opening the site, not for a link straight into a genre or a game.
  const [introDone, setIntroDone] = useState(route.kind !== 'home');
  const [launching, setLaunching] = useState<Game | null>(null);
  const [motionReady, setMotionReady] = useState(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const playing = route.kind === 'play';
  // The 3D waits until the intro is over, so the video has the phone to itself.
  const stage = useStage(hostRef, !playing && introDone);

  // A page that waits on this code to fade in would stay black on a slow or failed load.
  useEffect(() => {
    loadMotion().then(
      () => setMotionReady(true),
      () => {},
    );
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((next: Route) => {
    location.hash = routeHash(next);
  }, []);

  // Any first tap or key press allows sound.
  useEffect(() => {
    const unlock = () => {
      sfx.unlock();
      if (introDone && !playing) sfx.startHum();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [introDone, playing]);

  useEffect(() => {
    if (playing) {
      sfx.stopHum();
      return;
    }
    if (introDone) {
      sfx.startHum();
      stage?.skipToStars();
    }
  }, [playing, introDone, stage]);

  // The background takes on the colour of the page.
  useEffect(() => {
    stage?.setAccent(route.kind === 'genre' ? genreOf(route.id).color : BRAND_ORANGE);
  }, [stage, route]);

  // The view leans with the mouse, or with the phone where it reports its tilt.
  useEffect(() => {
    if (!stage) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') stage.setPointer((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma !== null && e.beta !== null) stage.setPointer(Math.max(-1, Math.min(1, e.gamma / 30)), Math.max(-1, Math.min(1, (e.beta - 45) / 30)));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('deviceorientation', onTilt, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('deviceorientation', onTilt);
    };
  }, [stage]);

  // With the landing page up and nothing else to do, fetch the game in the background.
  useEffect(() => {
    if (!introDone || playing) return;
    const save = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (save) return;
    const warm = () => void loadPenFight();
    const id = window.setTimeout(() => (window.requestIdleCallback ? window.requestIdleCallback(warm) : warm()), 1500);
    return () => window.clearTimeout(id);
  }, [introDone, playing]);

  const openGenre = (id: GenreId) => {
    feedback('open');
    stage?.pulse();
    go({ kind: 'genre', id });
  };

  const launch = (game: Game) => {
    // Covers anyone who came back from full screen, or never had the title screen's tap.
    autoFullscreen();
    sfx.unlock();
    sfx.launch();
    buzz(35);
    stage?.pulse();
    setLaunching(game);
    void Promise.all([loaders[game.id](), new Promise((r) => setTimeout(r, WIPE_MS))]).then(
      () => {
        go({ kind: 'play', id: game.id });
        setLaunching(null);
      },
      () => setLaunching(null),
    );
  };

  const onScroll = (top: number) => stage?.setScroll(top);
  const common = { onPlay: launch, onWarm: (game: Game) => void loaders[game.id](), onScroll, enter: motionReady };

  return (
    <LazyMotion features={loadMotion}>
      <MotionConfig reducedMotion="user">
        {!playing && (
          <div className="wp-root">
            <div ref={hostRef} className="wp-stage-host" aria-hidden />
            <div className="wp-vignette" aria-hidden />
            {!introDone && <Intro onDone={() => setIntroDone(true)} />}
            {introDone && (
              <AnimatePresence initial>
                {route.kind === 'genre' ? (
                  <GenrePage
                    key={route.id}
                    id={route.id}
                    {...common}
                    onBack={() => {
                      feedback('back');
                      go({ kind: 'home' });
                    }}
                  />
                ) : (
                  <Landing key="home" {...common} onGenre={openGenre} />
                )}
              </AnimatePresence>
            )}
          </div>
        )}

        {playing && (
          <Recover onLeave={() => go({ kind: 'home' })}>
          <Suspense fallback={<div className="wp-loading" role="status">
                <span className="wp-loader" aria-hidden />
                Loading the game…
              </div>}>
            {route.id === 'blade-rift' ? (
              <BladeGame onExit={() => go({ kind: 'genre', id: 'adventure' })} />
            ) : route.id === 'sword-fight' ? (
              <SwordGame onExit={() => go({ kind: 'genre', id: 'adventure' })} />
            ) : route.id === 'wolf-run' ? (
              <WolfRun onExit={() => go({ kind: 'genre', id: 'action' })} />
            ) : route.id === 'doodle-rush' ? (
              <DrawGame onExit={() => go({ kind: 'genre', id: 'online' })} />
            ) : route.id === 'guess-movie' ? (
              <MovieGame onExit={() => go({ kind: 'genre', id: 'office' })} />
            ) : (
              <PenFightGame onExit={() => go({ kind: 'home' })} />
            )}
          </Suspense>
          </Recover>
        )}

        <AnimatePresence>
          {launching && (
            <m.div
              className="wp-wipe"
              role="status"
              initial={{ y: '112%' }}
              animate={{ y: 0 }}
              exit={{ y: '-112%' }}
              transition={{ duration: 0.45, ease: [0.7, 0, 0.2, 1] }}
            >
              <img src={asset('brand/wildplayers-mark.webp')} alt="" width={568} height={451} />
              <span>Starting {launching.title}…</span>
              <span className="wp-loader is-dark" aria-hidden />
            </m.div>
          )}
        </AnimatePresence>
      </MotionConfig>
    </LazyMotion>
  );
}
