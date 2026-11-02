// Pen Fight relay server: pairs two players by room code and forwards moves.
// The game itself runs in the browsers; see src/net/protocol.ts for messages.
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT ?? 8787);
const RELAYED = new Set(['shot', 'sync', 'next']);
// No I or O, so codes are easy to read aloud.
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const PEN_MODELS = new Set(['ballpoint', 'reynolds', 'cello', 'addgel', 'retro51']);
const penOf = (msg) => (PEN_MODELS.has(msg.model) ? msg.model : 'cello');

/** @type {Map<string, import('ws').WebSocket[]>} */
const rooms = new Map();

function newCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

const send = (ws, msg) => ws.readyState === ws.OPEN && ws.send(JSON.stringify(msg));

function leave(ws) {
  const code = ws.room;
  if (!code || !rooms.has(code)) return;
  for (const peer of rooms.get(code)) if (peer !== ws) send(peer, { t: 'peer-left' });
  rooms.delete(code);
}

const wss = new WebSocketServer({ port: PORT });

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
      const code = String(msg.code ?? '').toUpperCase();
      const room = rooms.get(code);
      if (!room) return send(ws, { t: 'error', message: `No room called ${code}. Check the code with your friend.` });
      if (room.length >= 2) return send(ws, { t: 'error', message: `Room ${code} already has two players.` });
      room.push(ws);
      ws.room = code;
      ws.model = penOf(msg);
      const models = room.map((peer) => peer.model);
      room.forEach((peer, i) => send(peer, { t: 'start', you: i, models }));
    } else if (RELAYED.has(msg.t)) {
      const room = rooms.get(ws.room);
      if (!room) return;
      for (const peer of room) if (peer !== ws) send(peer, msg);
    }
  });

  ws.on('close', () => leave(ws));
});

console.log(`Pen Fight relay listening on ws://localhost:${PORT}`);
