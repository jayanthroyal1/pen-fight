import type { ClientMsg, ServerMsg } from './protocol';

export type Listener = (msg: ServerMsg) => void;

/**
 * A connection for online play: send the game's messages, hear the other
 * player's. Backed by Supabase Realtime when it's set up, otherwise by the
 * relay server (`server/`).
 */
export interface GameLink {
  send(msg: ClientMsg): Promise<void>;
  subscribe(listener: Listener): () => void;
  close(): void;
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

/** Online play runs over Supabase when its URL and public key are set. */
export const usesSupabase = SUPABASE_URL !== '' && SUPABASE_KEY !== '';

export async function connectGame(): Promise<GameLink> {
  if (usesSupabase) {
    // Loaded only when needed, so players who never go online don't download it.
    const [{ RealtimeLink }, { supabaseRealtime }] = await Promise.all([
      import('./realtimeLink'),
      import('./supabaseRealtime'),
    ]);
    return new RealtimeLink(supabaseRealtime(SUPABASE_URL, SUPABASE_KEY));
  }
  const { OnlineClient } = await import('./client');
  return new OnlineClient();
}
