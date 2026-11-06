import { useCallback, useEffect, useRef, useState } from 'react';
import { autoFullscreen, install, installOffer, onInstallChange, wasInstalled } from './fullscreen';
import { isAway, onAwayChange } from './lifecycle';
import { buzz, sfx } from './sfx';
import { Splash } from './Splash';
import { asset, stageTier } from './tier';

interface Props {
  onDone: () => void;
}

/** Stop this long before the film's end, while the logo is still on screen. */
const HOLD_BEFORE_END_S = 0.4;
/** If the film makes no progress for this long, stop waiting for it. */
const STALL_MS = 5000;
const OUT_MS = 380;

/** Screens taller than they are wide get the portrait cut, which keeps the whole logo in view. */
const TALL = '(max-aspect-ratio: 1/1)';
const videoFor = (tall: boolean) => asset(tall ? 'brand/intro-tall.mp4' : 'brand/intro-wide.mp4');

/** The splash stays up at least this long, and no longer than the wait below for the film. */
const SPLASH_MIN_MS = 1900;
const SPLASH_MIN_STILL_MS = 500;
const SPLASH_MAX_MS = 3500;

/** Who made it, along the bottom of the opening screens. */
function Credit() {
  return (
    <footer className="wp-credit">
      <p>
        Developed by <strong>Jayanth G</strong>
      </p>
      <p>Copyright © 2026</p>
    </footer>
  );
}

/**
 * `splash` opens everything; `welcome` then offers the Home Screen in a browser;
 * `film` plays; `hold` waits for the tap; `out` fades into the platform.
 */
type Phase = 'splash' | 'welcome' | 'film' | 'hold' | 'out';

/**
 * The opening. It starts on the splash while things load. In a browser it then offers the Home Screen, and pressing Play
 * now is also the tap browsers need before they allow sound, so the film plays
 * with sound. Once added to the Home Screen there's nothing to offer, so the film
 * plays straight after the splash, silently if it has to, with a Sound on button. The logo stays hidden until the film reveals it. However the
 * film ends (played out, skipped, stalled or never started), the logo slams in on
 * its own for Tap to start, so that screen never depends on the film's last frame.
 */
export function Intro({ onDone }: Props) {
  const useFilm = useRef(stageTier() !== 'off').current;
  const [phase, setPhase] = useState<Phase>('splash');
  // The splash stays over the next screen while it tears open.
  const [splashOpening, setSplashOpening] = useState(false);
  const [splashGone, setSplashGone] = useState(false);
  // The film is waiting on the network, which includes before its first frame.
  const [buffering, setBuffering] = useState(true);
  const [offer, setOffer] = useState(installOffer);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(sfx.muted);
  const [tall, setTall] = useState(() => window.matchMedia(TALL).matches);
  const videoRef = useRef<HTMLVideoElement>(null);
  const leaving = useRef(false);

  const hold = useCallback(() => {
    videoRef.current?.pause();
    setPhase((p) => (p === 'film' ? 'hold' : p));
  }, []);

  const finish = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    sfx.unlock();
    autoFullscreen();
    buzz(25);
    setPhase('out');
    sfx.warp();
    window.setTimeout(onDone, OUT_MS);
  }, [onDone]);

  useEffect(() => onInstallChange(() => setOffer(installOffer())), []);

  // Fetched now, so Tap to start never waits for its logo.
  useEffect(() => {
    const logo = new Image();
    logo.src = asset('brand/wildplayers-logo.webp');
    void logo.decode?.().catch(() => {});
  }, []);

  // The logo's landing.
  useEffect(() => {
    if (phase !== 'hold') return;
    sfx.launch();
    buzz(40);
  }, [phase]);

  /** Play now: this tap unlocks sound, so the film starts with it. */
  const startFilm = () => {
    const video = videoRef.current;
    sfx.unlock();
    autoFullscreen();
    buzz(25);
    if (!video) {
      setPhase('hold');
      return;
    }
    video.muted = sfx.muted;
    setMuted(sfx.muted);
    setPhase('film');
    video.play().catch(hold);
  };

  // After the splash: the offer in a browser. Once installed, the film, with sound if the browser allows it.
  useEffect(() => {
    if (phase !== 'splash') return;
    const installed = wasInstalled();
    let ready = !installed;
    let waited = false;
    let gone = false;
    const video = videoRef.current;
    const go = () => {
      if (gone) return;
      gone = true;
      setSplashOpening(true);
      if (!installed) {
        setPhase('welcome');
        return;
      }
      if (!video) {
        setPhase('hold');
        return;
      }
      setPhase('film');
      video.muted = sfx.muted;
      video.play().catch(() => {
        video.muted = true;
        setMuted(true);
        video.play().catch(hold);
      });
    };
    const check = () => {
      if (ready && waited) go();
    };
    const onReady = () => {
      ready = true;
      check();
    };
    if (!video || video.readyState >= 3) ready = true;
    else if (!ready) video.addEventListener('canplay', onReady, { once: true });
    const min = window.setTimeout(() => {
      waited = true;
      check();
    }, useFilm ? SPLASH_MIN_MS : SPLASH_MIN_STILL_MS);
    const max = window.setTimeout(() => {
      ready = true;
      waited = true;
      check();
    }, SPLASH_MAX_MS);
    return () => {
      window.clearTimeout(min);
      window.clearTimeout(max);
      video?.removeEventListener('canplay', onReady);
    };
    // Runs once, for the launch.
  }, []);

  // A phone turned mid-film carries on from the same moment in the other cut.
  useEffect(() => {
    const query = window.matchMedia(TALL);
    const onTurn = () => {
      const video = videoRef.current;
      const at = video?.currentTime ?? 0;
      const wasPlaying = video ? !video.paused : false;
      setTall(query.matches);
      if (!video) return;
      video.addEventListener(
        'loadedmetadata',
        () => {
          video.currentTime = at;
          if (wasPlaying) void video.play().catch(() => {});
        },
        { once: true },
      );
    };
    query.addEventListener('change', onTurn);
    return () => query.removeEventListener('change', onTurn);
  }, []);

  // Stepping away stops the film and its sound; it carries on when they're back.
  useEffect(() => {
    if (phase !== 'film') return;
    return onAwayChange((gone) => {
      const video = videoRef.current;
      if (!video) return;
      if (gone) video.pause();
      else void video.play().catch(() => {});
    });
  }, [phase]);

  // The film must never trap anyone: if it stops moving, go on without it.
  useEffect(() => {
    if (phase !== 'film' || !useFilm) return;
    let last = videoRef.current?.currentTime ?? 0;
    const id = window.setInterval(() => {
      if (isAway()) return;
      const t = videoRef.current?.currentTime ?? 0;
      if (t === last) hold();
      last = t;
    }, STALL_MS);
    return () => window.clearInterval(id);
  }, [phase, useFilm, hold]);

  const onTime = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setProgress(v.currentTime / v.duration);
    if (v.currentTime >= v.duration - HOLD_BEFORE_END_S) hold();
  };

  const toggleSound = () => {
    const next = !muted;
    sfx.unlock();
    sfx.setMuted(next);
    setMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
  };

  return (
    <div className={`wp-intro is-${phase}`}>
      {useFilm && (
        <video
          ref={videoRef}
          className="wp-intro-video"
          src={videoFor(tall)}
          playsInline
          muted
          preload="auto"
          disablePictureInPicture
          aria-hidden
          onWaiting={() => setBuffering(true)}
          onPlaying={() => setBuffering(false)}
          onTimeUpdate={onTime}
          onEnded={hold}
          onError={hold}
        />
      )}

      {phase === 'film' && buffering && <span className="wp-loader wp-film-loader" role="status" aria-label="Loading" />}

      {phase === 'welcome' && (
        <section className="wp-welcome" aria-labelledby="wp-welcome-title">
          <h1 id="wp-welcome-title" className="wp-welcome-title">
            {offer ? 'Add to your Home Screen' : 'You’re all set'}
          </h1>
          <p className="wp-welcome-lead">{offer ? 'Opens like an app: full screen, with no browser bar.' : 'WildPlayers is on your Home Screen.'}</p>
          {offer === 'ios' && (
            <ol className="wp-welcome-steps">
              <li>
                <span>
                  Tap <strong>Share</strong> in your browser
                </span>
              </li>
              <li>
                <span>
                  Choose <strong>Add to Home Screen</strong>
                </span>
              </li>
            </ol>
          )}
          {offer === 'menu' && (
            <ol className="wp-welcome-steps">
              <li>
                <span>
                  Open your browser’s <strong>menu</strong>
                </span>
              </li>
              <li>
                <span>
                  Choose <strong>Add to Home Screen</strong> or <strong>Install app</strong>
                </span>
              </li>
            </ol>
          )}
          <p className="wp-welcome-volume">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
              <polygon points="3,9 7,9 12,4 12,20 7,15 3,15" fill="currentColor" />
              <path d="M15 8.5a5 5 0 0 1 0 7M17.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Turn your volume up for the best experience
          </p>
          <div className="wp-welcome-actions">
            {offer === 'button' && (
              <button type="button" className="wp-play" onClick={() => void install()}>
                Add to Home Screen
              </button>
            )}
            <button type="button" className={offer === 'button' ? 'wp-welcome-later' : 'wp-play'} onClick={startFilm} autoFocus>
              {offer === 'button' ? 'Play in the browser' : 'Play now'}
            </button>
          </div>
        </section>
      )}

      {phase === 'film' && (
        <>
          <div className="wp-intro-controls">
            <button type="button" className="wp-intro-btn" aria-pressed={!muted} onClick={toggleSound}>
              {muted ? 'Sound on' : 'Sound off'}
            </button>
            <button type="button" className="wp-intro-btn" onClick={hold}>
              Skip intro
            </button>
          </div>
          <span className="wp-intro-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden />
        </>
      )}

      {phase === 'hold' && (
        <button type="button" className="wp-intro-title" onClick={finish} autoFocus aria-label="WildPlayers. Tap to start.">
          <span className="wp-slash" aria-hidden />
          <span className="wp-slash is-low" aria-hidden />
          <span className="wp-flash" aria-hidden />
          <img className="wp-intro-logo" src={asset('brand/wildplayers-logo.webp')} alt="" width={947} height={610} />
          <span className="wp-intro-prompt">Tap to start</span>
        </button>
      )}

      {!splashGone && <Splash leaving={splashOpening} still={!useFilm} onGone={() => setSplashGone(true)} />}

      {phase !== 'film' && phase !== 'out' && <Credit />}
    </div>
  );
}
