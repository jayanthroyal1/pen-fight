import { describe, expect, it } from 'vitest';
import type { PresenceChannel, Realtime } from '../net/realtimeLink';
import { DrawRoom, type ChatLine, type DrawMember } from './room';
import { Brush, applyInk, floodFill, paint, type InkOp, type Stroke } from './ink';
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
  it('keeps the guesser’s sheet the same as the drawer’s through every tool', async () => {
    const hub = new Hub();
    const a = seat(hub, 'Asha', 'aaa');
    const b = seat(hub, 'Bala', 'bbb');
    await b.room.join(await a.room.create());
    await b.until(() => b.last()?.players.length === 2);
    const ink = (s: typeof a) => (s.room as unknown as { strokes: Stroke[] }).strokes;
    const same = async () => {
      await b.until(() => JSON.stringify(ink(b)) === JSON.stringify(ink(a)));
      expect(ink(b)).toEqual(ink(a));
    };

    // The drawer sees points at once; the others get them in a batch.
    const first: InkOp = { k: 'add', id: 's1', color: '#000', width: 8, points: [1, 1], press: [60] };
    const more: InkOp = { k: 'add', id: 's1', color: '#000', width: 8, points: [9, 9], press: [90] };
    a.room.inkHere(first);
    a.room.inkHere(more);
    expect(ink(a)[0].points).toEqual([1, 1, 9, 9]);
    a.room.inkOut({ ...first, points: [1, 1, 9, 9], press: [60, 90] });
    await same();

    a.room.draw({ k: 'fill', id: 'f1', color: '#ff0000', x: 5, y: 5 });
    await same();
    expect(ink(b)).toHaveLength(2);

    a.room.undo();
    await b.until(() => ink(b).length === 1);
    expect(a.room.canRedo).toBe(true);
    a.room.redo();
    await same();
    expect(ink(b)[1].fill).toBe(true);
    expect(a.room.canRedo).toBe(false);

    a.room.undo();
    a.room.draw({ k: 'clear' });
    await b.until(() => ink(b).length === 0);
    expect(a.room.canRedo).toBe(false);
    await a.room.leave();
    await b.room.leave();
  });

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

describe('the brush', () => {
  it('ignores trembling, then follows a real move', () => {
    const brush = new Brush(100, 100, 0);
    expect(brush.move(100.5, 100.5, 16).points).toEqual([]);
    const { points } = brush.move(140, 100, 32);
    expect(points).toHaveLength(2);
    expect(points[0]).toBeGreaterThan(100);
    expect(points[0]).toBeLessThanOrEqual(140);
  });

  it('steadies a shaky slow line', () => {
    const brush = new Brush(0, 0, 0);
    const ys: number[] = [];
    for (let i = 1; i <= 60; i++) ys.push(...brush.move(i * 4, i % 2 ? 6 : -6, i * 16).points.filter((_, n) => n % 2 === 1));
    expect(Math.max(...ys.slice(10)) - Math.min(...ys.slice(10))).toBeLessThan(10);
  });

  it('thins as it speeds up, and a stylus goes by pressure', () => {
    const width = (step: number) => {
      const brush = new Brush(0, 0, 0);
      let last = 0;
      for (let i = 1; i < 40; i++) last = brush.move(i * step, 0, i * 16).press[0] ?? last;
      return last;
    };
    expect(width(90)).toBeLessThan(width(6));
    const soft = new Brush(0, 0, 0);
    const hard = new Brush(0, 0, 0);
    let a = 0;
    let b = 0;
    for (let i = 1; i < 30; i++) {
      a = soft.move(i * 10, 0, i * 16, 0.1).press[0];
      b = hard.move(i * 10, 0, i * 16, 0.95).press[0];
    }
    expect(b).toBeGreaterThan(a * 1.5);
  });

  it('keeps the eraser even', () => {
    const brush = new Brush(0, 0, 0, true);
    expect(brush.start().press).toEqual([100]);
    expect(brush.move(200, 0, 16).press).toEqual([100]);
  });

  it('catches up with the pointer when it lifts', () => {
    const brush = new Brush(0, 0, 0);
    brush.move(50, 0, 16);
    expect(brush.end(90, 0).points).toEqual([90, 0]);
  });
});

describe('the ink tools', () => {
  it('keeps widths with the points as a stroke grows', () => {
    let s = applyInk([], { k: 'add', id: 'a', color: '#000', width: 4, points: [0, 0], press: [60] });
    s = applyInk(s, { k: 'add', id: 'a', color: '#000', width: 4, points: [5, 5], press: [90] });
    expect(s).toHaveLength(1);
    expect(s[0].press).toEqual([60, 90]);
  });

  it('stores a fill, and puts an undone stroke back', () => {
    const s = applyInk([], { k: 'fill', id: 'f', color: '#ff0000', x: 1, y: 2 });
    expect(s[0]).toMatchObject({ fill: true, points: [1, 2] });
    const gone = applyInk(s, { k: 'undo' });
    expect(applyInk(gone, { k: 'put', stroke: s[0] })).toEqual(s);
  });

  it('fills up to a line and no further', () => {
    const w = 9;
    const h = 5;
    const data = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let y = 0; y < h; y++) data.set([0, 0, 0, 255], (y * w + 4) * 4);
    floodFill(data, w, h, 1, 1, [255, 0, 0]);
    const at = (x: number, y: number) => [...data.slice((y * w + x) * 4, (y * w + x) * 4 + 3)];
    expect(at(0, 0)).toEqual([255, 0, 0]);
    expect(at(3, 4)).toEqual([255, 0, 0]);
    expect(at(4, 2)).toEqual([0, 0, 0]);
    expect(at(6, 2)).toEqual([255, 255, 255]);
  });

  it('paints a stroke of changing width piece by piece', () => {
    const widths: number[] = [];
    const g = {
      set lineWidth(w: number) {
        widths.push(w);
      },
      beginPath() {},
      stroke() {},
      moveTo() {},
      lineTo() {},
      quadraticCurveTo() {},
    } as unknown as CanvasRenderingContext2D;
    paint(g, { id: 'a', color: '#000', width: 10, points: [0, 0, 10, 0, 20, 0], press: [50, 100, 60] });
    expect(widths.slice(1)).toEqual([5, 10, 6]);
  });
});
