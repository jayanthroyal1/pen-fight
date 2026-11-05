import type { PresenceChannel, Realtime } from '../net/realtimeLink';
import { isRoomCode } from '../net/invite';
import { applyInk, type InkOp, type Stroke } from './ink';
import {
  MAX_PLAYERS,
  addPlayer,
  backToLobby,
  chooseWord,
  fromView,
  guess,
  newGame,
  publicView,
  removePlayer,
  startGame,
  tick,
  type Game,
  type View,
} from './rules';
import { WORDS } from './words';

/** What each player announces in the room's channel. */
export interface DrawMember {
  name: string;
  /** When they arrived; the earliest player still here is the host. */
  at: number;
}

export interface ChatLine {
  name: string;
  text: string;
  kind: 'guess' | 'right' | 'close' | 'info';
}

/** Messages between players. The host runs the game; `to` marks one meant for a single player. */
type Msg =
  | { t: 'view'; view: View }
  | { t: 'chat'; line: ChatLine; to?: string }
  | { t: 'choices'; to: string; words: string[] }
  | { t: 'pick'; word: string }
  | { t: 'guess'; from: string; text: string }
  | { t: 'ink'; op: InkOp }
  | { t: 'need-ink'; from: string }
  | { t: 'all-ink'; to: string; strokes: Stroke[] }
  | { t: 'start' }
  | { t: 'again' };

export interface RoomEvents {
  view(view: View): void;
  chat(line: ChatLine): void;
  choices(words: string[]): void;
  ink(strokes: Stroke[], op: InkOp | null): void;
}

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
/** How long to wait for a channel to say who's already there. */
const SETTLE_MS = 1200;
const TICK_MS = 400;
const channelName = (code: string) => `doodle-${code}`;

export class DrawRoom {
  readonly id: string;
  code = '';
  private ch: PresenceChannel<DrawMember> | null = null;
  private game: Game = newGame();
  private lastView: View | null = null;
  private strokes: Stroke[] = [];
  private hosting = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastSent = '';
  private at = Date.now();

  constructor(
    private rt: Realtime<DrawMember>,
    private name: string,
    private events: RoomEvents,
    id?: string,
    private rng: () => number = Math.random,
    private now: () => number = Date.now,
  ) {
    this.id = id ?? `d${Math.floor(rng() * 1e9).toString(36)}`;
  }

  get isHost(): boolean {
    return this.hosting;
  }

  /** The word this player chose to draw, for their own screen. */
  secretWord: string | null = null;

  setSecret(word: string): void {
    this.secretWord = word;
  }

  private async open(code: string): Promise<PresenceChannel<DrawMember>> {
    const ch = this.rt.channel(channelName(code), this.id);
    ch.onMessage((payload) => this.receive(payload as Msg));
    ch.onSync(() => this.onMembers());
    await ch.subscribe();
    return ch;
  }

  /** Waits for the first word on who's already in a channel (or a short timeout). */
  private settle(ch: PresenceChannel<DrawMember>): Promise<void> {
    return new Promise((resolve) => {
      ch.onSync(() => resolve());
      globalThis.setTimeout(resolve, SETTLE_MS);
    });
  }

  /** Makes a new room with this player as host. */
  async create(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(this.rng() * LETTERS.length)]).join('');
      const ch = await this.open(code);
      await this.settle(ch);
      if (Object.keys(ch.members()).length > 0) {
        await ch.leave();
        continue;
      }
      this.ch = ch;
      this.code = code;
      await ch.track({ name: this.name, at: this.at });
      return code;
    }
    throw new Error('Couldn’t find a free room code. Try again.');
  }

  /** Joins a friend's room; rejects with a message to show if it can't. */
  async join(rawCode: string): Promise<void> {
    const code = rawCode.trim().toUpperCase();
    if (!isRoomCode(code)) throw new Error('Room codes are four letters. Check it and try again.');
    const ch = await this.open(code);
    await this.settle(ch);
    const count = Object.keys(ch.members()).length;
    if (count === 0 || count >= MAX_PLAYERS) {
      await ch.leave();
      throw new Error(count === 0 ? `No room called ${code}. Check the code with your friend.` : `Room ${code} is full.`);
    }
    this.ch = ch;
    this.code = code;
    await ch.track({ name: this.name, at: this.at });
    void ch.send({ t: 'need-ink', from: this.id } satisfies Msg);
  }

  /** Who's here decides who hosts, and the host keeps the game's players in step. */
  private onMembers(): void {
    const ch = this.ch;
    if (!ch) return;
    const members = ch.members();
    const ids = Object.keys(members).sort((a, b) => members[a].at - members[b].at || a.localeCompare(b));
    if (ids.length === 0) return;
    if (ids[0] === this.id && !this.hosting) this.becomeHost();
    if (!this.hosting) return;
    let g = this.game;
    for (const p of g.players) if (!members[p.id]) g = removePlayer(g, p.id, this.now());
    for (const id of ids) g = addPlayer(g, { id, name: String(members[id].name).slice(0, 16) || 'Player', score: 0 });
    this.update(g);
  }

  private becomeHost(): void {
    this.hosting = true;
    if (this.lastView) this.game = fromView(this.lastView, this.now());
    this.timer = setInterval(() => this.update(tick(this.game, WORDS, this.now(), this.rng)), TICK_MS);
  }

  /** Host: takes on a new game state and tells everyone what they may see. */
  private update(next: Game): void {
    const before = this.game;
    this.game = next;
    if (next.phase === 'choosing' && (before.phase !== 'choosing' || before.drawerId !== next.drawerId)) {
      this.strokes = [];
      this.events.ink([], { k: 'clear' });
      void this.ch?.send({ t: 'ink', op: { k: 'clear' } } satisfies Msg);
      if (next.drawerId) this.deliver({ t: 'choices', to: next.drawerId, words: next.choices });
    }
    const view = publicView(next, this.now());
    // The clock alone isn't news: send it only when something else changes, or every few seconds.
    const key = JSON.stringify({ ...view, left: Math.round(view.left / 5000) });
    if (key === this.lastSent) return;
    this.lastSent = key;
    this.deliver({ t: 'view', view });
  }

  /** Sends to the others, and acts on it here too. */
  private deliver(msg: Msg): void {
    void this.ch?.send(msg);
    this.receive(msg);
  }

  private receive(msg: Msg): void {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'view':
        this.lastView = msg.view;
        this.events.view(msg.view);
        break;
      case 'chat':
        if (!msg.to || msg.to === this.id) this.events.chat(msg.line);
        break;
      case 'choices':
        if (msg.to === this.id) this.events.choices(msg.words);
        break;
      case 'ink':
        this.strokes = applyInk(this.strokes, msg.op);
        this.events.ink(this.strokes, msg.op);
        break;
      case 'all-ink':
        if (msg.to === this.id) {
          this.strokes = msg.strokes;
          this.events.ink(this.strokes, null);
        }
        break;
      case 'need-ink':
        if (this.hosting) void this.ch?.send({ t: 'all-ink', to: msg.from, strokes: this.strokes } satisfies Msg);
        break;
      case 'pick':
        if (this.hosting) this.update(chooseWord(this.game, msg.word, this.now()));
        break;
      case 'start':
        if (this.hosting) this.update(startGame(this.game, WORDS, this.now(), this.rng));
        break;
      case 'again':
        if (this.hosting) this.update(backToLobby(this.game));
        break;
      case 'guess':
        if (this.hosting) this.judge(msg.from, msg.text);
        break;
    }
  }

  /** Host: checks a guess. A right one is never shown as text, so it can't help anyone. */
  private judge(from: string, rawText: string): void {
    const text = String(rawText).slice(0, 60);
    const name = this.game.players.find((p) => p.id === from)?.name ?? 'Player';
    const { game, result } = guess(this.game, from, text, this.now());
    if (result === 'right') this.deliver({ t: 'chat', line: { name, text: 'guessed the word!', kind: 'right' } });
    // A near miss is told only to the guesser: shown to all, it would give the word away.
    else if (result === 'close') this.deliver({ t: 'chat', to: from, line: { name: '', text: `“${text}” is very close!`, kind: 'close' } });
    else if (result === 'wrong' || this.game.phase !== 'drawing') {
      this.deliver({ t: 'chat', line: { name, text, kind: 'guess' } });
    }
    this.update(game);
  }

  private toHost(msg: Msg): void {
    if (this.hosting) this.receive(msg);
    else void this.ch?.send(msg);
  }

  start(): void {
    this.toHost({ t: 'start' });
  }

  playAgain(): void {
    this.toHost({ t: 'again' });
  }

  pick(word: string): void {
    this.toHost({ t: 'pick', word });
  }

  sendGuess(text: string): void {
    this.toHost({ t: 'guess', from: this.id, text });
  }

  draw(op: InkOp): void {
    this.deliver({ t: 'ink', op });
  }

  async leave(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const ch = this.ch;
    this.ch = null;
    await ch?.leave();
  }
}
