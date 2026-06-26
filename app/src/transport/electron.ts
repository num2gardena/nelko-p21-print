/**
 * Electron desktop transport (Windows/Linux).
 *
 * The printer is reached over its OS-paired serial endpoint: a virtual COM port
 * on Windows or /dev/rfcomm* on Linux. Serial I/O runs in the Electron main
 * process and is exposed to the renderer via the `window.nelko` preload bridge.
 */
import {
  type PrinterDevice,
  type PrinterTransport,
  type ReadOptions,
} from './PrinterTransport';

const PRINTER_BAUD = 115200;

/** True when running inside the Electron shell (preload bridge present). */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && window.nelko?.isElectron === true;
}

export class ElectronSerialTransport implements PrinterTransport {
  readonly name = 'Electron serialport';
  private connected = false;

  private get bridge() {
    const bridge = typeof window !== 'undefined' ? window.nelko : undefined;
    if (!bridge) {
      throw new Error('Electron bridge unavailable (window.nelko missing).');
    }
    return bridge;
  }

  async listDevices(): Promise<PrinterDevice[]> {
    const ports = await this.bridge.serial.list();
    return ports.map((p) => ({
      id: p.path,
      name: p.friendlyName ?? p.manufacturer ?? p.path,
      kind: 'serial' as const,
    }));
  }

  async connect(device: PrinterDevice): Promise<void> {
    await this.bridge.serial.open({ path: device.id, baudRate: PRINTER_BAUD });
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await this.bridge.serial.close();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async write(data: Uint8Array): Promise<void> {
    await this.bridge.serial.write(data);
  }

  async read(options?: ReadOptions): Promise<Uint8Array> {
    return this.bridge.serial.read({
      length: options?.length,
      timeoutMs: options?.timeoutMs,
    });
  }
}
