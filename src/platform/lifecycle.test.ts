import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Just enough of a browser for the watcher to run in. */
class FakeTarget {
  private handlers: Record<string, ((e?: unknown) => void)[]> = {};
  addEventListener(type: string, f: (e?: unknown) => void) {
    (this.handlers[type] ??= []).push(f);
  }
  fire(type: string) {
    (this.handlers[type] ?? []).forEach((f) => f());
  }
}

class FakeContext extends FakeTarget {
  state = 'running';
  resumes = 0;
  suspend() {
    this.state = 'suspended';
    this.fire('statechange');
    return Promise.resolve();
  }
  resume() {
    this.resumes += 1;
    if (this.canResume) {
      this.state = 'running';
      this.fire('statechange');
    }
    return Promise.resolve();
  }
  canResume = true;
}

async function setUp() {
  vi.resetModules();
  const win = Object.assign(new FakeTarget(), {
    matchMedia: () => ({ matches: true }),
    setInterval: (f: () => void, ms: number) => setInterval(f, ms),
    clearInterval: (id: number) => clearInterval(id),
  });
  const doc = Object.assign(new FakeTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  const life = await import('./lifecycle');
  const ctx = new FakeContext();
  life.watchAudio(ctx as unknown as AudioContext);
  return { life, ctx, win, doc };
}

describe('stepping away', () => {
  beforeEach(() => vi.useFakeTimers());

  it('stops the sound in the background and brings it back after', async () => {
    const { life, ctx, doc } = await setUp();
    const seen: boolean[] = [];
    life.onAwayChange((a) => seen.push(a));
    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    expect(life.isAway()).toBe(true);
    expect(ctx.state).toBe('suspended');
    doc.visibilityState = 'visible';
    doc.fire('visibilitychange');
    expect(life.isAway()).toBe(false);
    expect(ctx.state).toBe('running');
    expect(seen).toEqual([true, false]);
  });

  it('treats something covering the app on a phone as stepping away', async () => {
    const { life, ctx, win } = await setUp();
    win.fire('blur');
    expect(life.isAway()).toBe(true);
    expect(ctx.state).toBe('suspended');
    win.fire('focus');
    expect(ctx.state).toBe('running');
  });

  it('notices a call cutting the sound, and restarts it by itself when the call ends', async () => {
    const { life, ctx } = await setUp();
    ctx.canResume = false;
    ctx.state = 'interrupted';
    ctx.fire('statechange');
    expect(life.isAway()).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(ctx.state).toBe('interrupted');
    expect(ctx.resumes).toBeGreaterThan(1);
    ctx.canResume = true;
    vi.advanceTimersByTime(1000);
    expect(ctx.state).toBe('running');
    expect(life.isAway()).toBe(false);
  });

  it('waits for the player when asked', async () => {
    const { life, doc } = await setUp();
    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    let back = false;
    void life.whenHere().then(() => (back = true));
    await Promise.resolve();
    expect(back).toBe(false);
    doc.visibilityState = 'visible';
    doc.fire('visibilitychange');
    await Promise.resolve();
    await Promise.resolve();
    expect(back).toBe(true);
  });
});
