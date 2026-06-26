/**
 * Main-process serial bridge for the desktop transport.
 *
 * Talks to the printer over its OS-paired serial endpoint (a virtual COM port
 * on Windows, /dev/rfcomm* on Linux). `serialport` is imported lazily so simply
 * launching the app never loads the native binding until a port is opened.
 */
import type { OpenOptions, ReadRequest, SerialPortInfo } from './shared';

type SerialPortInstance = import('serialport').SerialPort;

const DEFAULT_BAUD = 115200;

class SerialManager {
  private port: SerialPortInstance | null = null;
  private buffer: Buffer = Buffer.alloc(0);

  async list(): Promise<SerialPortInfo[]> {
    const { SerialPort } = await import('serialport');
    const ports = await SerialPort.list();
    return ports.map((p) => ({
      path: p.path,
      manufacturer: p.manufacturer,
      serialNumber: p.serialNumber,
      vendorId: p.vendorId,
      productId: p.productId,
      friendlyName: (p as { friendlyName?: string }).friendlyName,
    }));
  }

  async open({ path, baudRate = DEFAULT_BAUD }: OpenOptions): Promise<void> {
    await this.close();
    const { SerialPort } = await import('serialport');
    this.buffer = Buffer.alloc(0);
    this.port = await new Promise<SerialPortInstance>((resolve, reject) => {
      const p = new SerialPort({ path, baudRate, autoOpen: true }, (err) => {
        if (err) reject(err);
        else resolve(p);
      });
    });
    this.port.on('data', (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
    });
  }

  isOpen(): boolean {
    return Boolean(this.port?.isOpen);
  }

  async write(data: Uint8Array): Promise<void> {
    const port = this.port;
    if (!port) throw new Error('Serial port is not open');
    await new Promise<void>((resolve, reject) => {
      port.write(Buffer.from(data), (err) => (err ? reject(err) : resolve()));
    });
    await new Promise<void>((resolve, reject) => {
      port.drain((err) => (err ? reject(err) : resolve()));
    });
  }

  /** Read a fixed number of bytes, or until the line goes idle, up to a timeout. */
  async read({ length, timeoutMs = 1000 }: ReadRequest): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;

    if (length && length > 0) {
      while (this.buffer.length < length && Date.now() < deadline) {
        await delay(10);
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
    this.buffer = Buffer.alloc(0);
    return new Uint8Array(out);
  }

  async close(): Promise<void> {
    const port = this.port;
    this.port = null;
    if (port?.isOpen) {
      await new Promise<void>((resolve) => port.close(() => resolve()));
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const serialManager = new SerialManager();
