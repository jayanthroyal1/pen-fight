import { m } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { autoFullscreen } from './fullscreen';
import { buzz, sfx } from './sfx';
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

/** `film` is playing; `hold` waits on the logo for the tap; `out` is fading into the platform. */
type Phase = 'film' | 'hold' | 'out';

/**
 * The opening: the film plays as soon as the site opens, then holds on the logo
 * with Tap to start, and that tap enters the platform. Browsers refuse sound
 * before a tap, so if it's refused the film plays silently with a Sound on
 * button. Where motion is unwelcome, data is short or the film can't play, the
 * logo and Tap to start show on their own.
 */
export function Intro({ onDone }: Props) {
  const useFilm = useRef(stageTier() !== 'off').current;
  const [phase, setPhase] = useState<Phase>(useFilm ? 'film' : 'hold');
  // No film frame to rest on, so the logo image stands in.
  const [noFilm, setNoFilm] = useState(!useFilm);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(sfx.muted);
  const [tall, setTall] = useState(() => window.matchMedia(TALL).matches);
  const videoRef = useRef<HTMLVideoElement>(null);
  const leaving = useRef(false);

  const hold = useCallback(() => {
    videoRef.current?.pause();
    setPhase((p) => (p === 'film' ? 'hold' : p));
  }, []);

  const giveUpOnFilm = useCallback(() => {
    setNoFilm(true);
    hold();
  }, [hold]);

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

  // Straight away with sound if the browser allows it, otherwise silently.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = sfx.muted;
    video.play().catch(() => {
      video.muted = true;
      setMuted(true);
      video.play().catch(giveUpOnFilm);
    });
  }, [giveUpOnFilm]);

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

  // The film must never trap anyone: if it stops moving, go on without it.
  useEffect(() => {
    if (phase !== 'film' || !useFilm) return;
    let last = -1;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      const t = videoRef.current?.currentTime ?? 0;
      if (t === last) giveUpOnFilm();
      last = t;
    }, STALL_MS);
    return () => window.clearInterval(id);
  }, [phase, useFilm, giveUpOnFilm]);

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
          onTimeUpdate={onTime}
          onEnded={hold}
          onError={giveUpOnFilm}
        />
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
          {noFilm && <img className="wp-intro-logo" src={asset('brand/wildplayers-logo.webp')} alt="" width={947} height={610} />}
          <m.span className="wp-intro-prompt" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            Tap to start
          </m.span>
        </button>
      )}
    </div>
  );
}
