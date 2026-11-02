// Starts the Pen Fight relay. PORT sets the port (default 8787).
import { startRelay } from './relay.js';

const { port } = await startRelay(Number(process.env.PORT ?? 8787));
console.log(`Pen Fight relay listening on ws://localhost:${port}`);
