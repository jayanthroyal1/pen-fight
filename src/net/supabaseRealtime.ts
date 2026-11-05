import { createClient } from '@supabase/supabase-js';
import type { Member, PresenceChannel, Realtime } from './realtimeLink';

/** Supabase Realtime channels, shaped for `RealtimeLink`. Uses only the public key. */
export function supabaseRealtime<M = Member>(url: string, publicKey: string): Realtime<M> {
  const supabase = createClient(url, publicKey, { auth: { persistSession: false } });
  return {
    channel(name, key): PresenceChannel<M> {
      const ch = supabase.channel(name, { config: { presence: { key }, broadcast: { self: false } } });
      const syncs: (() => void)[] = [];
      const leaves: ((key: string) => void)[] = [];
      const messages: ((payload: unknown) => void)[] = [];
      // Listeners must be attached before subscribing.
      ch.on('presence', { event: 'sync' }, () => syncs.forEach((f) => f()));
      ch.on('presence', { event: 'leave' }, ({ key: left }) => leaves.forEach((f) => f(left)));
      ch.on('broadcast', { event: 'msg' }, ({ payload }) => messages.forEach((f) => f(payload)));
      return {
        onSync: (f) => void syncs.push(f),
        onLeave: (f) => void leaves.push(f),
        onMessage: (f) => void messages.push(f),
        subscribe: () =>
          new Promise<void>((resolve, reject) => {
            ch.subscribe((status) => {
              if (status === 'SUBSCRIBED') resolve();
              else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`Realtime ${status}`));
            });
          }),
        track: async (member: M) => {
          await ch.track(member as Record<string, unknown>);
        },
        members: () =>
          Object.fromEntries(
            Object.entries(ch.presenceState()).map(([k, metas]) => [k, metas[0] as unknown as M]),
          ),
        send: async (payload) => {
          await ch.send({ type: 'broadcast', event: 'msg', payload });
        },
        leave: async () => {
          await supabase.removeChannel(ch);
        },
      };
    },
  };
}
