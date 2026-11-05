import { describe, expect, it } from 'vitest';
import { applyInk } from './ink';
import type { PresenceChannel, Realtime } from '../net/realtimeLink';
import { DrawRoom, type ChatLine, type DrawMember } from './room';
import { paint, type Stroke } from './ink';
import { CHOOSE_MS, DRAW_MS, REVEAL_MS, ROUNDS, addPlayer, backToLobby, chooseWord, guess, newGame, normalise, publicView, removePlayer, setSettings, startGame, tick, type Game, type View } from './rules';
import { WORDS } from './words';

const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const players = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}`, score: 0 }));
const drawing = (n = 3): Game => {
  const g = startGame(newGame(players(n)), WORDS, 0, seeded(3));
  return chooseWord(g, g.choices[0], 0);
};
const guesserOf = (g: Game, i = 0) => g.players.filter((p) => p.id !== g.drawerId)[i].id;

describe('a turn', () => {
  it('needs two players to start, and offers the drawer three words', () => {
    expect(startGame(newGame(players(1)), WORDS, 0).phase).toBe('lobby');
    const g = startGame(newGame(players(3)), WORDS, 0, seeded(3));
    expect(g.phase).toBe('choosing');
    expect(new Set(g.choices).size).toBe(3);
  });

  it('hides the word from the view until the turn ends', () => {
    const g = drawing();
    const v = publicView(g, 1000);
    expect(v.word).toBeNull();
    expect(v.mask).not.toContain((g.word as string).replace(/ /g, '').slice(0, 2));
    expect(v.mask.length).toBe((g.word as string).length);
    expect(JSON.stringify(v)).not.toContain(`"${g.word}"`);
  });

  it('picks a word for a drawer who runs out of time', () => {
    const g = startGame(newGame(players(2)), WORDS, 0, seeded(3));
    const t = tick(g, WORDS, CHOOSE_MS);
    expect(t.phase).toBe('drawing');
    expect(t.word).toBe(g.choices[0]);
  });

  it('pays faster guesses more, and the drawer a share', () => {
    const g = drawing();
    const fast = guess(g, guesserOf(g), g.word as string, 2000);
    const slow = guess(g, guesserOf(g), g.word as string, DRAW_MS - 2000);
    const scoreOf = (x: Game, id: string) => x.players.find((p) => p.id === id)!.score;
    expect(fast.result).toBe('right');
    expect(scoreOf(fast.game, guesserOf(g))).toBeGreaterThan(scoreOf(slow.game, guesserOf(g)));
    expect(scoreOf(fast.game, g.drawerId as string)).toBeGreaterThan(0);
  });

  it('accepts any spelling of spaces and case, and says when a guess is close', () => {
    const g = { ...drawing(), word: 'auto rickshaw' };
    expect(normalise('Auto-Rickshaw')).toBe('autorickshaw');
    expect(guess(g, guesserOf(g), 'AUTORICKSHAW', 100).result).toBe('right');
    expect(guess(g, guesserOf(g), 'auto rikshaw', 100).result).toBe('close');
    expect(guess(g, guesserOf(g), 'bus', 100).result).toBe('wrong');
    expect(guess(g, g.drawerId as string, 'auto rickshaw', 100).result).toBe('ignored');
  });

  it('ends early once everyone has guessed', () => {
    let g = drawing(3);
    g = guess(g, guesserOf(g, 0), g.word as string, 100).game;
    expect(g.phase).toBe('drawing');
    g = guess(g, guesserOf(g, 1), g.word as string, 200).game;
    expect(g.phase).toBe('reveal');
    expect(publicView(g, 300).word).toBe(g.word);
  });

  it('shows hint letters as time runs out, never the whole word', () => {
    let g: Game = { ...drawing(), word: 'elephant' };
    g = tick(g, WORDS, DRAW_MS * 0.6, seeded(1));
    expect(g.hints).toHaveLength(1);
    g = tick(g, WORDS, DRAW_MS * 0.8, seeded(2));
    expect(g.hints).toHaveLength(2);
    expect(publicView(g, DRAW_MS * 0.8).mask.replace(/_/g, '')).toHaveLength(2);
  });
});

describe('a whole game', () => {
  it('lets everyone draw once a round, for three rounds, then ends', () => {
    let g = startGame(newGame(players(3)), WORDS, 0, seeded(9));
    let t = 0;
    let turns = 0;
    while (g.phase !== 'over' && turns < 50) {
      t += CHOOSE_MS;
      g = tick(g, WORDS, t, seeded(t + 1));
      t += DRAW_MS;
      g = tick(g, WORDS, t, seeded(t + 2));
      t += REVEAL_MS;
      g = tick(g, WORDS, t, seeded(t + 3));
      turns++;
    }
    expect(g.phase).toBe('over');
    expect(turns).toBe(3 * ROUNDS);
  });

  it('survives players coming and going', () => {
    let g = drawing(3);
    g = addPlayer(g, { id: 'late', name: 'Late', score: 0 });
    expect(g.order).toContain('late');
    const drawer = g.drawerId as string;
    g = removePlayer(g, drawer, 500);
    expect(g.phase).toBe('reveal');
    const small = removePlayer(removePlayer(drawing(3), 'p0', 1), 'p1', 1);
    expect(small.phase).toBe('over');
  });
});

describe('the drawing', () => {
  it('adds to strokes, takes back and clears', () => {
    let s = applyInk([], { k: 'add', id: 'a', color: '#000', width: 6, points: [1, 2] });
    s = applyInk(s, { k: 'add', id: 'a', color: '#000', width: 6, points: [3, 4] });
    s = applyInk(s, { k: 'add', id: 'b', color: '#f00', width: 6, points: [5, 6] });
    expect(s).toHaveLength(2);
    expect(s[0].points).toEqual([1, 2, 3, 4]);
    expect(applyInk(s, { k: 'undo' })).toHaveLength(1);
    expect(applyInk(s, { k: 'clear' })).toEqual([]);
  });

  it('has plenty of words, none repeated', () => {
    expect(WORDS.length).toBeGreaterThan(100);
    expect(new Set(WORDS).size).toBe(WORDS.length);
  });
});

/** An in-memory stand-in for Supabase Realtime. */
class Hub implements Realtime<DrawMember> {
  rooms = new Map<string, Set<Chan>>();
  channel(name: string, key: string): PresenceChannel<DrawMember> {
    return new Chan(this, name, key);
  }
  peers(name: string) {
    return [...(this.rooms.get(name) ?? [])];
  }
}

class Chan implements PresenceChannel<DrawMember> {
  syncs: (() => void)[] = [];
  messages: ((p: unknown) => void)[] = [];
  member: DrawMember | null = null;
  constructor(
    private hub: Hub,
    private name: string,
    readonly key: string,
  ) {}
  onSync(cb: () => void) {
    this.syncs.push(cb);
  }
  onLeave() {}
  onMessage(cb: (p: unknown) => void) {
    this.messages.push(cb);
  }
  fire() {
    for (const c of this.hub.peers(this.name)) setTimeout(() => c.syncs.forEach((f) => f()), 2);
  }
  async subscribe() {
    if (!this.hub.rooms.has(this.name)) this.hub.rooms.set(this.name, new Set());
    this.hub.rooms.get(this.name)!.add(this);
    this.fire();
  }
  async track(m: DrawMember) {
    this.member = m;
    this.fire();
  }
  members() {
    return Object.fromEntries(this.hub.peers(this.name).filter((c) => c.member).map((c) => [c.key, c.member!]));
  }
  async send(p: unknown) {
    for (const c of this.hub.peers(this.name)) if (c !== this) c.messages.forEach((f) => f(structuredClone(p)));
  }
  async leave() {
    this.hub.rooms.get(this.name)?.delete(this);
    this.fire();
  }
}

function seat(hub: Hub, name: string, id: string) {
  const got = { views: [] as View[], chat: [] as ChatLine[], choices: [] as string[][], ink: 0 };
  const room = new DrawRoom(hub, name, {
    view: (v) => got.views.push(v),
    chat: (l) => got.chat.push(l),
    choices: (w) => got.choices.push(w),
    ink: () => got.ink++,
  }, id, seeded(id.length + 7));
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 300 && !ok(); i++) await new Promise((r) => setTimeout(r, 5));
    expect(ok()).toBe(true);
  };
  return { room, got, until, last: () => got.views[got.views.length - 1] };
}

describe('a room', () => {
  it('plays a turn between host and guest, keeping the word from the guesser', async () => {
    const hub = new Hub();
    const a = seat(hub, 'Asha', 'aaa');
    const b = seat(hub, 'Bala', 'bbb');
    const code = await a.room.create();
    await b.room.join(code.toLowerCase());
    await b.until(() => b.last()?.players.length === 2);
    expect(a.room.isHost).toBe(true);
    expect(b.room.isHost).toBe(false);

    b.room.start();
    await a.until(() => a.last()?.phase === 'choosing');
    const drawer = a.last().drawerId === 'aaa' ? a : b;
    const guesser = drawer === a ? b : a;
    await drawer.until(() => drawer.got.choices.length === 1);
    expect(guesser.got.choices).toHaveLength(0);
    const word = drawer.got.choices[0][0];
    drawer.room.pick(word);
    await guesser.until(() => guesser.last()?.phase === 'drawing');
    expect(guesser.last().word).toBeNull();

    drawer.room.draw({ k: 'add', id: 's', color: '#000', width: 6, points: [10, 10] });
    await guesser.until(() => guesser.got.ink > 1);

    guesser.room.sendGuess('zebra crossing');
    await drawer.until(() => drawer.got.chat.some((l) => l.text === 'zebra crossing'));
    guesser.room.sendGuess(word);
    await guesser.until(() => guesser.last()?.phase === 'reveal');
    expect(guesser.last().word).toBe(word);
    expect(drawer.got.chat.some((l) => l.text === word)).toBe(false);
    await a.room.leave();
    await b.room.leave();
  });

  it('explains a bad code, and a room with nobody in it', async () => {
    const hub = new Hub();
    await expect(seat(hub, 'C', 'ccc').room.join('12')).rejects.toThrow(/four letters/);
    await expect(seat(hub, 'C', 'ccc').room.join('ZZZZ')).rejects.toThrow(/No room called ZZZZ/);
  });

  it('hands the game to the next player when the host leaves', async () => {
    const hub = new Hub();
    const a = seat(hub, 'A', 'aaa');
    const b = seat(hub, 'B', 'bbb');
    const code = await a.room.create();
    await new Promise((r) => setTimeout(r, 3));
    await b.room.join(code);
    await b.until(() => b.last()?.players.length === 2);
    await a.room.leave();
    await b.until(() => b.room.isHost);
    await b.room.leave();
  });
});

describe('the host’s settings', () => {
  it('sets the rounds and drawing time, and keeps them for the next game', () => {
    const g = setSettings(newGame(players(2)), 5, 120);
    expect(publicView(g, 0)).toMatchObject({ rounds: 5, drawMs: 120_000 });
    const playing = chooseWord(startGame(g, WORDS, 0, seeded(1)), startGame(g, WORDS, 0, seeded(1)).choices[0], 0);
    expect(playing.deadline).toBe(120_000);
    expect(backToLobby(playing)).toMatchObject({ rounds: 5, drawMs: 120_000 });
  });

  it('ignores anything not on offer, and any change once the game is on', () => {
    const lobby = newGame(players(2));
    expect(setSettings(lobby, 99, 80)).toBe(lobby);
    const started = startGame(lobby, WORDS, 0, seeded(1));
    expect(setSettings(started, 5, 60)).toBe(started);
  });
});

describe('points won in a turn', () => {
  it('counts for the guesser and the drawer, then clears for the next turn', () => {
    const first = startGame(newGame(players(3)), WORDS, 0, seeded(3));
    const g = chooseWord(first, first.choices[0], 0);
    const who = g.players.find((p) => p.id !== g.drawerId)!.id;
    const after = guess(g, who, g.word as string, 1000).game;
    expect(after.gained[who]).toBeGreaterThan(0);
    expect(after.gained[g.drawerId as string]).toBe(Math.round(after.gained[who] * 0.3));
    const ended = tick(after, WORDS, DRAW_MS, seeded(1));
    expect(tick(ended, WORDS, DRAW_MS + REVEAL_MS, seeded(1)).gained).toEqual({});
  });
});

describe('painting a stroke', () => {
  const pen = () => {
    const calls: string[] = [];
    const log = (name: string) => (...a: number[]) => void calls.push(`${name} ${a.join(' ')}`);
    const g = { beginPath() {}, stroke() {}, fill() {}, arc: log('arc'), moveTo: log('move'), lineTo: log('line'), quadraticCurveTo: log('curve') };
    return { g: g as unknown as CanvasRenderingContext2D, calls };
  };
  const stroke = (points: number[]): Stroke => ({ id: 'a', color: '#000', width: 4, points });

  it('curves through the points and ends on the last one', () => {
    const { g, calls } = pen();
    paint(g, stroke([0, 0, 10, 0, 20, 10]));
    expect(calls).toEqual(['move 0 0', 'line 5 0', 'curve 10 0 15 5', 'line 20 10']);
  });

  it('carries on from where the last batch curved to, leaving no gap', () => {
    const { g, calls } = pen();
    paint(g, stroke([0, 0, 10, 0, 20, 10, 30, 10]), 6);
    expect(calls[0]).toBe('move 15 5');
    expect(calls[calls.length - 1]).toBe('line 30 10');
  });

  it('joins a dot to the line it becomes', () => {
    const { g, calls } = pen();
    paint(g, stroke([0, 0, 10, 0]), 2);
    expect(calls).toEqual(['move 0 0', 'line 5 0', 'line 10 0']);
  });
});
