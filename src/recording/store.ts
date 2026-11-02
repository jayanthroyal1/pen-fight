import type { MatchRecord } from './types';

/**
 * Where recorded matches go. Async so a remote store (Supabase, planned) can
 * replace the localStorage one without touching the game.
 */
export interface MatchStore {
  /** Inserts or replaces the match with this id. */
  save(record: MatchRecord): Promise<void>;
  get(id: string): Promise<MatchRecord | null>;
  /** Newest first. */
  list(): Promise<MatchRecord[]>;
}

const INDEX_KEY = 'penfight:matches';
const matchKey = (id: string) => `penfight:match:${id}`;
/** Oldest matches are dropped beyond this, to stay inside the browser's storage quota. */
export const MAX_STORED_MATCHES = 30;

export class LocalMatchStore implements MatchStore {
  constructor(private storage: Storage = globalThis.localStorage) {}

  async save(record: MatchRecord): Promise<void> {
    const ids = this.readIndex().filter((id) => id !== record.id);
    ids.unshift(record.id);
    const data = JSON.stringify(record);
    // Make room by dropping the oldest matches until the write fits.
    for (;;) {
      try {
        this.storage.setItem(matchKey(record.id), data);
        break;
      } catch (err) {
        const oldest = ids.length > 1 ? ids.pop() : undefined;
        if (!oldest) throw err;
        this.storage.removeItem(matchKey(oldest));
      }
    }
    for (const dropped of ids.splice(MAX_STORED_MATCHES)) this.storage.removeItem(matchKey(dropped));
    this.storage.setItem(INDEX_KEY, JSON.stringify(ids));
  }

  async get(id: string): Promise<MatchRecord | null> {
    const raw = this.storage.getItem(matchKey(id));
    return raw ? (JSON.parse(raw) as MatchRecord) : null;
  }

  async list(): Promise<MatchRecord[]> {
    const out: MatchRecord[] = [];
    for (const id of this.readIndex()) {
      const record = await this.get(id);
      if (record) out.push(record);
    }
    return out;
  }

  private readIndex(): string[] {
    try {
      const ids = JSON.parse(this.storage.getItem(INDEX_KEY) ?? '[]');
      return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      return [];
    }
  }
}

/** Keeps matches in memory; used when localStorage is blocked, and in tests. */
export class MemoryMatchStore implements MatchStore {
  private records = new Map<string, MatchRecord>();

  async save(record: MatchRecord): Promise<void> {
    this.records.delete(record.id);
    this.records.set(record.id, structuredClone(record));
  }

  async get(id: string): Promise<MatchRecord | null> {
    return this.records.get(id) ?? null;
  }

  async list(): Promise<MatchRecord[]> {
    return [...this.records.values()].reverse();
  }
}

function defaultStore(): MatchStore {
  try {
    const probe = 'penfight:probe';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return new LocalMatchStore(localStorage);
  } catch {
    return new MemoryMatchStore();
  }
}

let store: MatchStore | null = null;

/** The store recordings are saved to. Swap with `setMatchStore` (e.g. for Supabase). */
export function getMatchStore(): MatchStore {
  return (store ??= defaultStore());
}

export function setMatchStore(next: MatchStore): void {
  store = next;
}
