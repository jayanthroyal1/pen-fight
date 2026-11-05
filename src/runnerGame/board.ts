/**
 * Wolf Run's leaderboard, through the two functions in supabase/wolf_run_scores.sql.
 * Plain requests, so the game doesn't need to load the Supabase library. The game
 * plays the same whether or not any of this answers.
 */

export interface BoardRow {
  name: string;
  score: number;
  me: boolean;
}

export interface Board {
  top: BoardRow[];
  /** This player's place, once they have a score on the board. */
  rank: number | null;
  players: number;
}

const URL_BASE = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim();
const KEY = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim();
const TIMEOUT_MS = 8000;

/** Turns what came back into a board, or null if it isn't one. */
export function parseBoard(data: unknown): Board | null {
  const d = data as { top?: unknown; rank?: unknown; players?: unknown } | null;
  if (!d || !Array.isArray(d.top)) return null;
  const top = d.top
    .map((r: { name?: unknown; score?: unknown; me?: unknown }) => ({
      name: String(r?.name ?? 'Player').slice(0, 16),
      score: Math.max(0, Math.floor(Number(r?.score) || 0)),
      me: r?.me === true,
    }))
    .sort((a, b) => b.score - a.score);
  return { top, rank: typeof d.rank === 'number' ? d.rank : null, players: Number(d.players) || top.length };
}

async function call(fn: string, body: object, fetcher: typeof fetch): Promise<Board | null> {
  if (!URL_BASE || !KEY) return null;
  try {
    const res = await fetcher(`${URL_BASE}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok ? parseBoard(await res.json()) : null;
  } catch {
    // Offline, or the table isn't set up yet.
    return null;
  }
}

export const fetchBoard = (player: string, fetcher: typeof fetch = fetch) => call('wolf_board', { p_player: player }, fetcher);

export const submitScore = (player: string, name: string, score: number, fetcher: typeof fetch = fetch) =>
  call('wolf_submit', { p_player: player, p_name: name, p_score: score }, fetcher);
