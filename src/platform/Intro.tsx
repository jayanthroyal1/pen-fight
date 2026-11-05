import { m } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { autoFullscreen } from './fullscreen';
import { buzz, sfx } from './sfx';
import { asset, stageTier } from './tier';

interface Props {
  onDone: () => void;
}

/** Hand over to the landing page this long before the video's end, as it settles on the logo. */
const END_EARLY_S = 0.5;
/** If the video makes no progress for this long, stop waiting for it. */
const STALL_MS = 5000;
const OUT_MS = 380;

/** Screens taller than they are wide get the portrait cut, which keeps the whole logo in view. */
const TALL = '(max-aspect-ratio: 1/1)';
const videoFor = (tall: boolean) => asset(tall ? 'brand/intro-tall.mp4' : 'brand/intro-wide.mp4');

type Phase = 'title' | 'video' | 'out';

/**
 * The opening film. Browsers only allow sound after a tap, so it tries to play
 * straight away and, if it's refused, waits on a title screen for the tap that
 * starts it from the first frame with sound. Where motion is unwelcome or data
 * is short, the title screen simply leads into the platform with no video.
 */
export function Intro({ onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('title');
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(sfx.muted);
  const [tall, setTall] = useState(() => window.matchMedia(TALL).matches);
  const videoRef = useRef<HTMLVideoElement>(null);
  const leaving = useRef(false);
  const useVideo = useRef(stageTier() !== 'off').current;

  const finish = useCallback(() => {
    if (leaving.current) return;
    leaving.current = true;
    setPhase('out');
    sfx.warp();
    window.setTimeout(onDone, OUT_MS);
  }, [onDone]);

  const start = useCallback(() => {
    sfx.unlock();
    buzz(25);
    autoFullscreen();
    const video = videoRef.current;
    if (!video) {
      finish();
      return;
    }
    video.muted = sfx.muted;
    setPhase('video');
    video.play().catch(finish);
  }, [finish]);

  // Try for no tap at all: some browsers allow sound for sites people come back to.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || sfx.muted) return;
    video.play().then(
      () => setPhase('video'),
      () => {},
    );
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

  // The film must never trap anyone: if it stops moving, go on without it.
  useEffect(() => {
    if (phase !== 'video') return;
    let last = -1;
    const id = window.setInterval(() => {
      const t = videoRef.current?.currentTime ?? 0;
      if (t === last) finish();
      last = t;
    }, STALL_MS);
    return () => window.clearInterval(id);
  }, [phase, finish]);

  const onTime = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    setProgress(v.currentTime / v.duration);
    if (v.currentTime >= v.duration - END_EARLY_S) finish();
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
      {useVideo && (
        <video
          ref={videoRef}
          className="wp-intro-video"
          src={videoFor(tall)}
          playsInline
          preload="auto"
          disablePictureInPicture
          aria-hidden
          onTimeUpdate={onTime}
          onEnded={finish}
          onError={finish}
        />
      )}

      {phase === 'title' && (
        <button type="button" className="wp-intro-title" onClick={() => {
            if (useVideo) start();
            else {
              autoFullscreen();
              finish();
            }
          }} autoFocus aria-label="WildPlayers. Tap to start.">
          <img className="wp-intro-logo" src={asset('brand/wildplayers-logo.webp')} alt="" width={947} height={610} />
          <m.span className="wp-intro-prompt" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.3 }}>
            Tap to start
          </m.span>
        </button>
      )}

      {phase === 'video' && (
        <>
          <div className="wp-intro-controls">
            <button type="button" className="wp-intro-btn" aria-pressed={!muted} onClick={toggleSound}>
              {muted ? 'Sound on' : 'Sound off'}
            </button>
            <button type="button" className="wp-intro-btn" onClick={finish}>
              Skip intro
            </button>
          </div>
          <span className="wp-intro-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden />
        </>
      )}
    </div>
  );
}
