import type { PenLevel } from './pens';

/**
 * Bet rooms. Each costs a bet to enter (the winner takes the loser's bet and
 * pen), lets in pens from a minimum level, and has its own classroom.
 */
export type RoomId = 'public' | 'private' | 'cbse' | 'international';

/** A classroom's look and sound. */
export interface RoomTheme {
  wall: string;
  dado: string;
  floor: 'tiles' | 'terrazzo' | 'vinyl' | 'carpet';
  floorColors: [string, string];
  desk: [string, string];
  /** 0 spotless … 1 carved up by twenty years of pupils. */
  wear: number;
  bench: string;
  light: string;
  /** Which room's recording to play, if it has its own. */
  noise: 'public' | 'private' | 'cbse' | 'international';
}

export interface Room {
  id: RoomId;
  name: string;
  bet: number;
  minLevel: PenLevel;
  theme: RoomTheme;
}

export const ROOMS: Room[] = [
  {
    id: 'public',
    name: 'Government School',
    bet: 25,
    minLevel: 1,
    theme: {
      wall: '#5d7a55', dado: '#3d5236', floor: 'tiles', floorColors: ['#d9cfb8', '#8f8573'],
      desk: ['#a85f28', '#934e1e'], wear: 1, bench: '#6e3f1c', light: '#fff1d6', noise: 'public',
    },
  },
  {
    id: 'private',
    name: 'Private School',
    bet: 50,
    minLevel: 2,
    theme: {
      wall: '#e9dcc0', dado: '#2f5d8a', floor: 'terrazzo', floorColors: ['#cfc8bc', '#9d968a'],
      desk: ['#b27a4a', '#9a6438'], wear: 0.6, bench: '#2f5d8a', light: '#fff4e2', noise: 'private',
    },
  },
  {
    id: 'cbse',
    name: 'CBSE School',
    bet: 75,
    minLevel: 3,
    theme: {
      wall: '#f2efe6', dado: '#8a2b2b', floor: 'vinyl', floorColors: ['#c9b79a', '#a8956f'],
      desk: ['#c99a62', '#b5844d'], wear: 0.35, bench: '#8a2b2b', light: '#f5f7ff', noise: 'cbse',
    },
  },
  {
    id: 'international',
    name: 'International School',
    bet: 100,
    minLevel: 4,
    theme: {
      wall: '#e7ecef', dado: '#2c3e50', floor: 'carpet', floorColors: ['#4a5a6a', '#3d4b59'],
      desk: ['#e9e4da', '#d8d0c2'], wear: 0.1, bench: '#2c3e50', light: '#ffffff', noise: 'international',
    },
  },
];

/** Practice games use the government school classroom, without a bet. */
export const PRACTICE_ROOM = ROOMS[0];

const BY_ID = new Map(ROOMS.map((r) => [r.id, r]));

export function room(id: RoomId): Room {
  return BY_ID.get(id) ?? ROOMS[0];
}

export function isRoomId(v: unknown): v is RoomId {
  return typeof v === 'string' && BY_ID.has(v as RoomId);
}
