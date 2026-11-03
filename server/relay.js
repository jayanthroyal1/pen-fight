// Pen Fight relay: pairs two players in a bet room and forwards their moves.
// Players meet either by room code (one creates, the other joins with the code or an
// invite link) or by quick match (the next two players looking in the same bet room).
// The game itself runs in the browsers; see src/net/protocol.ts for messages.
import { WebSocketServer } from 'ws';

const RELAYED = new Set(['shot', 'aim', 'sync', 'next', 'prize']);
// No I or O, so codes are easy to read aloud.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOMS = { public: 25, private: 50, cbse: 75, international: 100 };
const PEN_MODELS = new Set([
  'inkmax-aqua', 'inkmax-rose', 'gripper', 'frosty', 'clear-grip', 'butterfly-pink', 'navy-writer', 'techno-tip', 'click-red', 'click-sky',
  'click-blue', 'four-colour', 'teal-alu', 'rose-alu', 'gunmetal', 'silver-stripe', 'exec-gold-clip', 'flamingo-gold', 'silver-line', 'gold-dot',
]);
const POWERS = new Set(['giant', 'webflick', 'comet', 'nightwing', 'amazon', 'chakra', 'hanuman']);

const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

/** A player's seat from their message, with anything unknown replaced by safe defaults. */
function seatOf(msg) {
  const loadout = msg.loadout ?? {};
  return {
    name: String(msg.name ?? 'Player').slice(0, 20) || 'Player',
    loadout: {
      model: PEN_MODELS.has(loadout.model) ? loadout.model : 'inkmax-aqua',
      power: POWERS.has(loadout.power) ? loadout.power : null,
    },
  };
}

const roomOf = (msg) => (msg.room in ROOMS ? msg.room : null);

/**
 * Starts a relay on `port` (0 picks a free one).
 * @returns {Promise<{ port: number, close: () => Promise<void> }>}
 */
export function startRelay(port) {
  /** @type {Map<string, { room: string, players: import('ws').WebSocket[] }>} */
  const rooms = new Map();
  /** Per bet room, the one player waiting for a quick match, if any. */
  const waiting = new Map();

  const newCode = () => {
    let code;
    do {
      code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
    } while (rooms.has(code));
    return code;
  };

  const leave = (ws) => {
    for (const [room, w] of waiting) if (w === ws) waiting.delete(room);
    const code = ws.code;
    ws.code = undefined;
    const match = code && rooms.get(code);
    if (!match) return;
    for (const peer of match.players) if (peer !== ws) send(peer, { t: 'peer-left' });
    rooms.delete(code);
  };

  /** Puts both players in a new room and starts their match. */
  const startMatch = (room, players) => {
    const code = newCode();
    rooms.set(code, { room, players });
    for (const p of players) p.code = code;
    const seats = players.map((p) => p.seat);
    players.forEach((p, i) => send(p, { t: 'start', you: i, room, players: seats }));
  };

  const wss = new WebSocketServer({ port });

  wss.on('connection', (ws) => {
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }

      if (msg.t === 'create' || msg.t === 'join' || msg.t === 'quick') {
        const room = roomOf(msg);
        if (!room) return send(ws, { t: 'error', message: 'Pick a bet room first.' });
        leave(ws);
        ws.seat = seatOf(msg);

        if (msg.t === 'create') {
          const code = newCode();
          rooms.set(code, { room, players: [ws] });
          ws.code = code;
          send(ws, { t: 'created', code });
        } else if (msg.t === 'join') {
          const code = String(msg.code ?? '').toUpperCase();
          const match = rooms.get(code);
          if (!match) return send(ws, { t: 'error', message: `No room called ${code}. Check the code with your friend.` });
          if (match.players.length >= 2) return send(ws, { t: 'error', message: `Room ${code} already has two players.` });
          if (match.room !== room) {
            return send(ws, { t: 'error', message: `Room ${code} is a ₹${ROOMS[match.room]} match. Pick that bet to join.` });
          }
          rooms.delete(code);
          startMatch(room, [match.players[0], ws]);
        } else {
          const other = waiting.get(room);
          if (other && other !== ws && other.readyState === other.OPEN) {
            waiting.delete(room);
            startMatch(room, [other, ws]);
          } else {
            waiting.set(room, ws);
            send(ws, { t: 'queued' });
          }
        }
      } else if (msg.t === 'cancel') {
        leave(ws);
      } else if (RELAYED.has(msg.t)) {
        const match = rooms.get(ws.code);
        if (!match) return;
        for (const peer of match.players) if (peer !== ws) send(peer, msg);
      }
    });

    ws.on('close', () => leave(ws));
  });

  return new Promise((resolve) => {
    wss.on('listening', () =>
      resolve({
        port: wss.address().port,
        close: () =>
          new Promise((done) => {
            for (const client of wss.clients) client.terminate();
            wss.close(() => done());
          }),
      }),
    );
  });
}
