import { WOLF_PARTS } from '../runnerGame/wolf';
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
      <rect width="320" height="170" fill="#21252d" />
      <polygon points="0,170 120,60 210,170" fill="#2b3039" />
      <polygon points="320,0 200,96 320,130" fill="#181b21" />
      <g className="wp-art-pen wp-art-pen-a">
        <polygon points="10,132 142,78 150,92 18,146" fill="#ff6a13" />
        <polygon points="10,132 142,78 145,84 13,138" fill="#ffb07f" />
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

/** A half-drawn cat on a sheet, with the pen still at work, for Doodle Rush's card. */
export function DoodleArt() {
  const line = { fill: 'none', stroke: '#14100c', strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <svg className="wp-pen-art" viewBox="0 0 320 170" aria-hidden>
      <rect width="320" height="170" fill="#21252d" />
      <polygon points="52,12 268,6 276,158 44,164" fill="#f2f0ea" />
      <path {...line} d="M118 118c-16-30-8-58 2-74 8 6 15 12 20 18 12-3 26-3 38 0 6-7 12-13 21-18 9 18 15 44 1 74-20 22-62 22-82 0z" />
      <path {...line} d="M140 92h.1M180 92h.1M152 108c6 6 12 6 18 0" />
      <path d="M84 96 42 88M84 108H40M236 96l40-8" fill="none" stroke="#ff6a13" strokeWidth="5" strokeLinecap="round" />
      <polygon points="276,78 300,52 310,62 286,88 272,92" fill="#ff6a13" />
      <text x="160" y="154" textAnchor="middle" fontFamily="Anton, Impact, sans-serif" fontSize="17" letterSpacing="5" fill="#14100c">_ _ _</text>
    </svg>
  );
}

/** The wolf mid-leap over a rock, for Wolf Run's card. */
export function WolfRunArt() {
  return (
    <svg className="wp-pen-art" viewBox="0 0 320 170" aria-hidden>
      <rect width="320" height="170" fill="#0f1115" />
      <polygon points="0,130 60,70 120,120 190,60 260,118 320,84 320,170 0,170" fill="#181b21" />
      <circle cx="262" cy="42" r="20" fill="#f2f0ea" />
      <circle cx="254" cy="38" r="18" fill="#0f1115" />
      <rect y="136" width="320" height="34" fill="#2b3039" />
      <rect y="136" width="320" height="3" fill="#ff6a13" />
      <polygon points="190,136 196,112 212,102 228,114 234,136" fill="#4a505c" />
      <polygon points="196,112 212,102 214,126 204,136 190,136" fill="#6a7180" />
      <g transform="translate(92 42) scale(2) rotate(-10 32 22)">
        <polygon points="14,32 20,32 8,44 3,44" fill="#c94f06" />
        <polygon points="36,32 42,32 54,42 49,44" fill="#ff6a13" />
        {WOLF_PARTS.map((p) => (
          <polygon key={p.points.join()} points={p.points.join(' ')} fill={p.fill} />
        ))}
      </g>
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

export function FullscreenIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        d={on ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="square"
      />
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
