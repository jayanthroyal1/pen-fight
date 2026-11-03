import type { BoostId } from '../game/boosts';

/** Small drawn icons for the super powers. */
export function BoostIcon({ id }: { id: BoostId }) {
  const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' } as const;
  const paths: Record<BoostId, React.ReactNode> = {
    lightning: <path d="M13 2 4 14h6l-1 8 9-12h-6z" />,
    health: <path d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.3 5 6.7 5c2 0 3.6 1.2 5.3 3 1.7-1.8 3.3-3 5.3-3 3.4 0 5.5 3.6 4.2 6.8C19.5 16.4 12 21 12 21z" />,
    grip: (
      <>
        <circle cx="12" cy="5" r="2.4" {...line} />
        <path d="M12 7.5v13M6 11h12M4 15c0 3.5 3.6 5.5 8 5.5s8-2 8-5.5" {...line} />
      </>
    ),
    ice: <path d="M12 2v20M3.3 7l17.4 10M20.7 7 3.3 17M9 3.5l3 2.5 3-2.5M9 20.5l3-2.5 3 2.5" {...line} />,
    strike: <path d="M12 2c1 4 5 5.5 5 10.5A5 5 0 0 1 7 12.5c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-9z" />,
    tilt: (
      <>
        <path d="M3 9 21 5" {...line} strokeWidth={2.4} />
        <path d="M6 9.5V20M18 6.5V20" {...line} />
        <path d="m18 18 3 2h-6z" />
      </>
    ),
    wall: <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" />,
    double: (
      <>
        <path d="M4 12a7 7 0 0 1 12-5l2 2M20 12a7 7 0 0 1-12 5l-2-2" {...line} />
        <path d="M19 4v5h-5M5 20v-5h5" {...line} strokeLinejoin="round" />
      </>
    ),
  };
  return (
    <svg className="boost-icon" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      {paths[id]}
    </svg>
  );
}
