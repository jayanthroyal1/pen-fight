import type { Profile } from './economy';

/**
 * Where player profiles (wallet and pencil box) are kept. Async so a server
 * store (Supabase, planned) can replace the browser one without touching the game.
 */
export interface ProfileStore {
  list(): Promise<Profile[]>;
  save(profile: Profile): Promise<void>;
  remove(id: string): Promise<void>;
  activeId(): Promise<string | null>;
  setActive(id: string): Promise<void>;
}

const KEY = 'penfight:profiles';

interface Saved {
  profiles: Profile[];
  active: string | null;
}

export class LocalProfileStore implements ProfileStore {
  constructor(private storage: Storage = globalThis.localStorage) {}

  async list(): Promise<Profile[]> {
    return this.read().profiles;
  }

  async save(profile: Profile): Promise<void> {
    const s = this.read();
    const i = s.profiles.findIndex((p) => p.id === profile.id);
    if (i >= 0) s.profiles[i] = profile;
    else s.profiles.push(profile);
    this.write(s);
  }

  async remove(id: string): Promise<void> {
    const s = this.read();
    s.profiles = s.profiles.filter((p) => p.id !== id);
    if (s.active === id) s.active = s.profiles[0]?.id ?? null;
    this.write(s);
  }

  async activeId(): Promise<string | null> {
    return this.read().active;
  }

  async setActive(id: string): Promise<void> {
    const s = this.read();
    s.active = id;
    this.write(s);
  }

  private read(): Saved {
    try {
      const raw = JSON.parse(this.storage.getItem(KEY) ?? 'null');
      if (raw && Array.isArray(raw.profiles)) return { profiles: raw.profiles, active: raw.active ?? null };
    } catch {
      // Corrupt or blocked storage: start fresh.
    }
    return { profiles: [], active: null };
  }

  private write(s: Saved): void {
    this.storage.setItem(KEY, JSON.stringify(s));
  }
}

/** Keeps profiles in memory; used when localStorage is blocked, and in tests. */
export class MemoryProfileStore implements ProfileStore {
  private profiles: Profile[] = [];
  private active: string | null = null;

  async list() {
    return structuredClone(this.profiles);
  }
  async save(profile: Profile) {
    const i = this.profiles.findIndex((p) => p.id === profile.id);
    if (i >= 0) this.profiles[i] = structuredClone(profile);
    else this.profiles.push(structuredClone(profile));
  }
  async remove(id: string) {
    this.profiles = this.profiles.filter((p) => p.id !== id);
    if (this.active === id) this.active = this.profiles[0]?.id ?? null;
  }
  async activeId() {
    return this.active;
  }
  async setActive(id: string) {
    this.active = id;
  }
}

let store: ProfileStore | null = null;

export function getProfileStore(): ProfileStore {
  if (store) return store;
  try {
    localStorage.setItem('penfight:probe', '1');
    localStorage.removeItem('penfight:probe');
    store = new LocalProfileStore(localStorage);
  } catch {
    store = new MemoryProfileStore();
  }
  return store;
}

export function setProfileStore(next: ProfileStore): void {
  store = next;
}
