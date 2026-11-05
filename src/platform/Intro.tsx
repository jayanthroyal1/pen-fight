import { AnimatePresence, m } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buzz, sfx } from './sfx';
import type { PlatformStage } from './stage';
import { asset } from './tier';

interface Props {
  stage: PlatformStage | null;
  /** The 3D has either loaded or won't: the intro can start. */
  settled: boolean;
  onDone: () => void;
}

/** How long the points take to pull together into the logo. */
const BUILD_MS = 2600;
const PLAIN_BUILD_MS = 700;
/** The flight through the logo before the landing page shows. */
const WARP_MS = 1100;

type Phase = 'wait' | 'build' | 'ready' | 'out';

/**
 * The opening: points spiral in and become the logo, it lands with a flash and
 * its sound, then one tap flies through it into the platform. Browsers only
 * allow sound after a tap, so that tap also plays the stinger if it hasn't yet.
 */
export function Intro({ stage, settled, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('wait');
  const stung = useRef(false);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const sting = () => {
    if (stung.current) return;
    sfx.stinger();
    stung.current = sfx.canPlay();
  };

  useEffect(() => {
    if (!settled) return;
    setPhase('build');
    stage?.playAssemble(BUILD_MS / 1000);
    const id = window.setTimeout(
      () => {
        setPhase((p) => (p === 'build' ? 'ready' : p));
        sting();
      },
      stage ? BUILD_MS : PLAIN_BUILD_MS,
    );
    return () => window.clearTimeout(id);
  }, [settled, stage]);

  const enter = useCallback(() => {
    if (phaseRef.current === 'out') return;
    sfx.unlock();
    setPhase('out');
    sting();
    sfx.warp();
    buzz(30);
    stage?.warp(WARP_MS / 1000);
    window.setTimeout(onDone, stage ? WARP_MS - 250 : 350);
  }, [stage, onDone]);

  const showLogo = phase === 'wait' || phase === 'ready';
  return (
    <button type="button" className="wp-intro" onClick={enter} autoFocus aria-label="WildPlayers. Tap to enter.">
      <m.img
        className="wp-intro-logo"
        src={asset('brand/wildplayers-logo.webp')}
        alt=""
        width={947}
        height={610}
        initial={false}
        animate={
          phase === 'out'
            ? { opacity: 0, scale: 2.6 }
            : showLogo
              ? { opacity: 1, scale: 1 }
              : { opacity: 0, scale: 1.05 }
        }
        transition={{ duration: phase === 'out' ? 0.5 : phase === 'ready' ? 0.28 : 0.35, ease: 'easeOut' }}
      />
      <AnimatePresence>
        {phase === 'ready' && (
          <m.span
            key="flash"
            className="wp-intro-flash"
            initial={{ opacity: 0.9 }}
            animate={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        )}
        {phase === 'ready' && (
          <m.span
            key="ring"
            className="wp-intro-ring"
            initial={{ scale: 0.3, opacity: 0.9 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          />
        )}
      </AnimatePresence>
      <span className="wp-intro-foot">
        {phase === 'ready' ? (
          <m.span
            className="wp-intro-prompt"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.3 }}
          >
            Tap to enter
          </m.span>
        ) : (
          phase !== 'out' && <span className="wp-intro-skip">Tap to skip</span>
        )}
      </span>
    </button>
  );
}
