import type { ClientMsg, ServerMsg } from './protocol';

const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ??
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:8787`;

type Listener = (msg: ServerMsg) => void;

export class OnlineClient {
  private ws: WebSocket;
  private listeners = new Set<Listener>();
  private ready: Promise<void>;

  constructor(url: string = SERVER_URL) {
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', () => reject(new Error('connect failed')), { once: true });
    });
    this.ws.addEventListener('message', (e) => {
      const msg = JSON.parse(String(e.data)) as ServerMsg;
      for (const l of this.listeners) l(msg);
    });
    this.ws.addEventListener('close', () => {
      for (const l of this.listeners) l({ t: 'peer-left' });
    });
  }

  async send(msg: ClientMsg): Promise<void> {
    await this.ready;
    this.ws.send(JSON.stringify(msg));
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.listeners.clear();
    this.ws.close();
  }
}
