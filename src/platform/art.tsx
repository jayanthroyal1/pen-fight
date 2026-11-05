import type { GenreId } from './catalog';

/** Faceted art for each genre, cut in angles like the wolf in the logo. */
export function GenreArt({ id }: { id: GenreId }) {
  const shapes: Record<GenreId, React.ReactNode> = {
    action: (
      <>
        <polygon points="56,4 18,54 44,54 34,92 80,36 52,36" fill="currentColor" />
        <polygon points="56,4 18,54 44,54" fill="#fff" opacity="0.28" />
        <polygon points="12,20 30,26 20,34" fill="currentColor" opacity="0.55" />
        <polygon points="80,62 92,74 76,74" fill="currentColor" opacity="0.55" />
      </>
    ),
    adventure: (
      <>
        <polygon points="4,86 36,26 68,86" fill="currentColor" />
        <polygon points="36,26 68,86 40,86" fill="#000" opacity="0.22" />
        <polygon points="44,86 68,42 92,86" fill="currentColor" opacity="0.65" />
        <polygon points="36,26 28,41 36,45 44,41" fill="#fff" opacity="0.8" />
        <polygon points="68,12 68,42 71,42 71,22 86,17 71,12" fill="#fff" />
      </>
    ),
    office: (
      <>
        <polygon points="6,46 90,8 62,86 44,58" fill="currentColor" />
        <polygon points="90,8 44,58 62,86" fill="#000" opacity="0.2" />
        <polygon points="90,8 6,46 44,58" fill="#fff" opacity="0.24" />
        <polygon points="44,58 36,82 54,70" fill="currentColor" opacity="0.7" />
      </>
    ),
    simulation: (
      <>
        <polygon points="48,6 88,28 48,50 8,28" fill="#fff" opacity="0.85" />
        <polygon points="8,28 48,50 48,92 8,70" fill="currentColor" />
        <polygon points="88,28 48,50 48,92 88,70" fill="currentColor" opacity="0.62" />
        <polygon points="48,50 48,92 66,82 66,40" fill="#000" opacity="0.14" />
      </>
    ),
    puzzle: (
      <>
        <polygon points="10,30 34,30 30,14 46,6 62,14 58,30 84,30 84,52 96,48 96,72 84,68 84,90 10,90" fill="currentColor" />
        <polygon points="10,30 34,30 46,48 10,90" fill="#fff" opacity="0.22" />
        <polygon points="84,30 84,90 46,90 62,52" fill="#000" opacity="0.18" />
      </>
    ),
    online: (
      <>
        <polygon points="48,6 84,26 84,70 48,90 12,70 12,26" fill="currentColor" opacity="0.28" />
        <polygon points="48,6 62,26 62,70 48,90 34,70 34,26" fill="currentColor" opacity="0.7" />
        <polygon points="12,42 84,42 84,54 12,54" fill="currentColor" />
        <polygon points="48,6 84,26 62,26" fill="#fff" opacity="0.5" />
        <circle cx="48" cy="48" r="7" fill="#fff" />
      </>
    ),
  };
  return (
    <svg className="wp-genre-art" viewBox="0 0 96 96" aria-hidden>
      {shapes[id]}
    </svg>
  );
}

/** Two pens clashing in a burst of sparks, for Pen Fight's card. */
export function PenFightArt() {
  return (
    <svg className="wp-pen-art" viewBox="0 0 320 170" aria-hidden>
      <defs>
        <linearGradient id="wp-desk" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a1a12" />
          <stop offset="1" stopColor="#123047" />
        </linearGradient>
        <radialGradient id="wp-glow">
          <stop offset="0" stopColor="#ffb46b" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ff7a1a" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="320" height="170" fill="url(#wp-desk)" />
      <polygon points="0,170 120,60 210,170" fill="#ff7a1a" opacity="0.07" />
      <polygon points="320,0 200,96 320,130" fill="#4f8cff" opacity="0.08" />
      <circle className="wp-art-glow" cx="160" cy="84" r="74" fill="url(#wp-glow)" />
      <g className="wp-art-pen wp-art-pen-a">
        <polygon points="10,132 142,78 150,92 18,146" fill="#ff7a1a" />
        <polygon points="10,132 142,78 145,84 13,138" fill="#ffc08a" />
        <polygon points="142,78 164,76 150,92" fill="#f3f6f9" />
        <polygon points="10,132 18,146 6,150 0,138" fill="#7a2c06" />
      </g>
      <g className="wp-art-pen wp-art-pen-b">
        <polygon points="310,132 178,78 170,92 302,146" fill="#3f8cff" />
        <polygon points="310,132 178,78 175,84 307,138" fill="#a9ccff" />
        <polygon points="178,78 156,76 170,92" fill="#f3f6f9" />
        <polygon points="310,132 302,146 314,150 320,138" fill="#123a7a" />
      </g>
      <polygon className="wp-art-spark" points="160,44 168,70 194,62 176,82 196,100 168,94 160,122 152,94 124,100 144,82 126,62 152,70" fill="#fff4dc" />
    </svg>
  );
}

export function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path d="M4 9.5v5h4l5 4.5V5L8 9.5z" fill="currentColor" />
      {muted ? (
        <path d="m16 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      ) : (
        <path d="M16 8.5a5 5 0 0 1 0 7M18.6 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
      <path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
