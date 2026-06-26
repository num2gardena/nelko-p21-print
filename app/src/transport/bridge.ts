/**
 * Bridge transport — connects to the print-server's WebSocket<->Bluetooth pipe
 * (tools/server.py, or the dev-only tools/bt_bridge.py), which holds a native
 * RFCOMM socket to the printer.
 *
 * This is the modern desktop-browser path for Bluetooth Classic: no rfcomm, no
 * COM port, works in any browser. When the app is served by the print-server
 * the endpoint is same-origin (ws(s)://<host>/bt); otherwise it falls back to
 * the standalone dev bridge on ws://127.0.0.1:8765.
 */
import {
  type PrinterDevice,
  type PrinterTransport,
  type ReadOptions,
} from './PrinterTransport';

export const DEFAULT_BRIDGE_URL = 'ws://127.0.0.1:8765';

/**
 * WebSocket close code that asks the print-server to actually drop its
 * persistent RFCOMM socket (i.e. truly disconnect the printer), as opposed to a
 * transient close (page refresh) where the socket is kept for fast reuse.
 */
export const RELEASE_CLOSE_CODE = 4001;

/** Same-origin `/bt` endpoint when served by the print-server, else the dev default. */
export function sameOriginBridgeUrl(): string {
  if (typeof location !== 'undefined' && location.host) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    return `${proto}://${location.host}/bt`;
  }
  return DEFAULT_BRIDGE_URL;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class BridgeTransport implements PrinterTransport {
  readonly name = 'Bluetooth bridge';

  private ws: WebSocket | null = null;
  private buffer = new Uint8Array(0);
  private closeReason: string | null = null;
  private readonly url: string;

  constructor(url: string = sameOriginBridgeUrl()) {
    this.url = url;
  }

  async listDevices(): Promise<PrinterDevice[]> {
    return [{ id: 'bridge', name: 'Printer via bridge', kind: 'bluetooth' }];
  }

  connect(_device: PrinterDevice): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.url);
      ws.binaryType = 'arraybuffer';
      this.buffer = new Uint8Array(0);
      this.closeReason = null;

      ws.onopen = () => {
        this.ws = ws;
        settled = true;
        resolve();
      };
      ws.onmessage = (ev) => {
        if (ev.data instanceof ArrayBuffer) this.append(new Uint8Array(ev.data));
      };
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          reject(
            new Error(
              `Cannot reach the print-server at ${this.url}. Is it running?`,
            ),
          );
        }
      };
      ws.onclose = (ev) => {
        this.closeReason = ev.reason || 'Bridge connection closed';
        if (this.ws === ws) this.ws = null;
        if (!settled) {
          settled = true;
          reject(new Error(this.closeReason));
        }
      };
    });
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(this.closeReason ?? 'Not connected');
    }
    // Copy into a fresh ArrayBuffer-backed array for WebSocket.send typing.
    this.ws.send(new Uint8Array(data));
  }

  async read(options?: ReadOptions): Promise<Uint8Array> {
    const length = options?.length;
    const timeoutMs = options?.timeoutMs ?? 1000;
    const deadline = Date.now() + timeoutMs;

    if (length && length > 0) {
      while (this.buffer.length < length && Date.now() < deadline) {
        await delay(5);
      }
      const out = this.buffer.subarray(0, length);
      this.buffer = this.buffer.subarray(out.length);
      return new Uint8Array(out);
    }

    let lastLen = this.buffer.length;
    let idleSince = Date.now();
    while (Date.now() < deadline) {
      await delay(20);
      if (this.buffer.length !== lastLen) {
        lastLen = this.buffer.length;
        idleSince = Date.now();
      } else if (this.buffer.length > 0 && Date.now() - idleSince > 100) {
        break;
      }
    }
    const out = this.buffer;
    this.buffer = new Uint8Array(0);
    return out;
  }

  async disconnect(): Promise<void> {
    // Ask the server to release the printer (not just drop this WebSocket).
    this.ws?.close(RELEASE_CLOSE_CODE, 'release');
    this.ws = null;
    this.buffer = new Uint8Array(0);
  }

  private append(chunk: Uint8Array): void {
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer, 0);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;
  }
}
