// Pen Fight relay: pairs two players and forwards their moves.
// Players meet either by room code (one creates, the other joins with the code or an
// invite link) or by quick match (the next two players looking are paired).
// The game itself runs in the browsers; see src/net/protocol.ts for messages.
import { WebSocketServer } from 'ws';

const RELAYED = new Set(['shot', 'sync', 'next']);
// No I or O, so codes are easy to read aloud.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PEN_MODELS = new Set(['ballpoint', 'reynolds', 'cello', 'addgel', 'retro51']);
const penOf = (msg) => (PEN_MODELS.has(msg.model) ? msg.model : 'cello');

const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

/**
 * Starts a relay on `port` (0 picks a free one).
 * @returns {Promise<{ port: number, close: () => Promise<void> }>}
 */
export function startRelay(port) {
  /** @type {Map<string, import('ws').WebSocket[]>} */
  const rooms = new Map();
  /** The one player waiting for a quick match, if any. */
  let waiting = null;

  const newCode = () => {
    let code;
    do {
      code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
    } while (rooms.has(code));
    return code;
  };

  const leaveQueue = (ws) => {
    if (waiting === ws) waiting = null;
  };

  const leave = (ws) => {
    leaveQueue(ws);
    const code = ws.room;
    ws.room = undefined;
    if (!code || !rooms.has(code)) return;
    for (const peer of rooms.get(code)) if (peer !== ws) send(peer, { t: 'peer-left' });
    rooms.delete(code);
  };

  /** Puts both players in a new room and starts their match. */
  const startMatch = (players) => {
    const code = newCode();
    rooms.set(code, players);
    for (const p of players) p.room = code;
    const models = players.map((p) => p.model);
    players.forEach((p, i) => send(p, { t: 'start', you: i, models }));
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

      if (msg.t === 'create') {
        leave(ws);
        const code = newCode();
        rooms.set(code, [ws]);
        ws.room = code;
        ws.model = penOf(msg);
        send(ws, { t: 'created', code });
      } else if (msg.t === 'join') {
        leave(ws);
        const code = String(msg.code ?? '').toUpperCase();
        const room = rooms.get(code);
        if (!room) return send(ws, { t: 'error', message: `No room called ${code}. Check the code with your friend.` });
        if (room.length >= 2) return send(ws, { t: 'error', message: `Room ${code} already has two players.` });
        ws.model = penOf(msg);
        rooms.delete(code);
        startMatch([room[0], ws]);
      } else if (msg.t === 'quick') {
        leave(ws);
        ws.model = penOf(msg);
        const other = waiting;
        if (other && other !== ws && other.readyState === other.OPEN) {
          waiting = null;
          startMatch([other, ws]);
        } else {
          waiting = ws;
          send(ws, { t: 'queued' });
        }
      } else if (msg.t === 'cancel') {
        leave(ws);
      } else if (RELAYED.has(msg.t)) {
        const room = rooms.get(ws.room);
        if (!room) return;
        for (const peer of room) if (peer !== ws) send(peer, msg);
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
