import { useCallback, useEffect, useState } from 'react';
import { newProfile, newTesterProfile, pocketMoney, testerTopUp, today, type Profile } from './economy';
import { getProfileStore } from './store';

export interface ProfilesState {
  ready: boolean;
  profiles: Profile[];
  active: Profile | null;
  /** Pocket money handed out on this visit, to tell the player about. */
  notices: string[];
  create(name: string): Promise<Profile>;
  save(profile: Profile): Promise<void>;
  setActive(id: string): Promise<void>;
  /** Opens the test account (creating it the first time) and makes it the player. */
  openTester(name: string): Promise<Profile>;
  dismissNotices(): void;
}

/** The players on this device: loads them, gives daily pocket money, saves changes. */
export function useProfiles(): ProfilesState {
  const store = getProfileStore();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [notices, setNotices] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await store.list();
      const day = today();
      const given: string[] = [];
      const updated = await Promise.all(
        list.map(async (p) => {
          const r = pocketMoney(testerTopUp(p), day);
          if (r.profile === p) return p;
          await store.save(r.profile);
          if (r.rupees) given.push(`${p.name} got ₹${r.rupees} pocket money.`);
          if (r.pen) given.push(`${p.name} got a free pen to keep playing.`);
          return r.profile;
        }),
      );
      const active = await store.activeId();
      if (cancelled) return;
      setProfiles(updated);
      setActiveId(active && updated.some((p) => p.id === active) ? active : (updated[0]?.id ?? null));
      setNotices(given);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  const save = useCallback(
    async (next: Profile) => {
      // The test account never runs out of money.
      const profile = testerTopUp(next);
      setProfiles((list) => {
        const i = list.findIndex((p) => p.id === profile.id);
        return i >= 0 ? list.map((p) => (p.id === profile.id ? profile : p)) : [...list, profile];
      });
      await store.save(profile);
    },
    [store],
  );

  const create = useCallback(
    async (name: string) => {
      // Each new player's starting pens differ from everyone else's on this device.
      const profile = newProfile(name, Math.random, profiles.map((p) => p.pens.map((pen) => pen.model)));
      await save(profile);
      setActiveId((id) => id ?? profile.id);
      if (!(await store.activeId())) await store.setActive(profile.id);
      return profile;
    },
    [profiles, save, store],
  );

  const setActive = useCallback(
    async (id: string) => {
      setActiveId(id);
      await store.setActive(id);
    },
    [store],
  );

  const openTester = useCallback(
    async (name: string) => {
      const existing = profiles.find((p) => p.tester && p.name.toLowerCase() === name.toLowerCase());
      const profile = existing ? testerTopUp(existing) : newTesterProfile(name);
      if (profile !== existing) await save(profile);
      await setActive(profile.id);
      return profile;
    },
    [profiles, save, setActive],
  );

  return {
    ready,
    profiles,
    active: profiles.find((p) => p.id === activeId) ?? null,
    notices,
    create,
    save,
    setActive,
    openTester,
    dismissNotices: () => setNotices([]),
  };
}
