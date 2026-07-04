/// <reference types="w3c-web-serial" />
/**
 * Web Serial transport — desktop Chrome/Edge fallback (PWA / browser).
 *
 * Works with any OS serial port, including a Bluetooth SPP COM port on Windows
 * or a manually bound /dev/rfcomm* on Linux. The user picks the port via the
 * browser's native picker (requires a user gesture, so it runs during the
 * Connect click). Not available on Android or in non-Chromium browsers.
 */
import {
  type PrinterDevice,
  type PrinterTransport,
  type ReadOptions,
} from './PrinterTransport';

const PRINTER_BAUD = 115200;

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function isWebSerialSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export class WebSerialTransport implements PrinterTransport {
  readonly name = 'Web Serial';

  private port: SerialPort | null = null;
  private pendingPort: SerialPort | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private readerStopped = false;
  private buffer = new Uint8Array(0);

  async listDevices(): Promise<PrinterDevice[]> {
    if (!isWebSerialSupported()) {
      const isHttp = typeof window !== 'undefined' && !window.isSecureContext;
      if (isHttp) {
        throw new Error(
          'Web Serial is not available because this site is loaded over a non-secure connection (HTTP). ' +
            'Web Serial requires a secure context. Please access the site via HTTPS or localhost/127.0.0.1.',
        );
      }
      throw new Error(
        'Web Serial is not supported by your browser or is disabled. ' +
          'If you are using Brave, make sure "Serial ports" is enabled in brave://settings/content/serialPorts. ' +
          'Note that Firefox and Safari do not currently support Web Serial.',
      );
    }
    // Must run inside the user gesture (the Connect click).
    const port = await navigator.serial.requestPort();
    this.pendingPort = port;
    const info = port.getInfo();
    const name =
      info.usbVendorId != null
        ? `Serial ${info.usbVendorId.toString(16)}:${(info.usbProductId ?? 0).toString(16)}`
        : 'Serial port';
    return [{ id: 'web-serial', name, kind: 'serial' }];
  }

  async connect(_device: PrinterDevice): Promise<void> {
    const port = this.pendingPort;
    if (!port) throw new Error('No serial port selected');
    await port.open({ baudRate: PRINTER_BAUD });
    this.port = port;
    this.writer = port.writable?.getWriter() ?? null;
    this.buffer = new Uint8Array(0);
    this.startReader();
  }

  isConnected(): boolean {
    return this.port != null;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.writer) throw new Error('Not connected');
    await this.writer.write(data);
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
    this.readerStopped = true;
    try {
      await this.reader?.cancel();
    } catch {
      // ignore
    }
    this.reader = null;
    try {
      this.writer?.releaseLock();
    } catch {
      // ignore
    }
    this.writer = null;
    try {
      await this.port?.close();
    } catch {
      // ignore
    }
    this.port = null;
    this.pendingPort = null;
    this.buffer = new Uint8Array(0);
  }

  private startReader(): void {
    const port = this.port;
    if (!port) return;
    this.readerStopped = false;
    void (async () => {
      while (!this.readerStopped && port.readable) {
        const reader = port.readable.getReader();
        this.reader = reader;
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) this.append(value);
          }
        } catch {
          // read error -> outer loop re-acquires or exits
        } finally {
          try {
            reader.releaseLock();
          } catch {
            // ignore
          }
          this.reader = null;
        }
      }
    })();
  }

  private append(chunk: Uint8Array): void {
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer, 0);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;
  }
}
