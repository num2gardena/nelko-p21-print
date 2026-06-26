/**
 * Transport abstraction.
 *
 * The P21 speaks Bluetooth Classic SPP/RFCOMM, which the Web Bluetooth API
 * cannot reach. Each platform therefore provides its own implementation:
 *   - Android  -> custom Kotlin Capacitor plugin (RFCOMM socket, SPP UUID)
 *   - Electron -> Node `serialport` in the main process (COM / /dev/rfcomm*)
 *   - Web      -> Web Serial API (desktop Chrome/Edge) fallback
 *
 * The shared UI and core logic only ever see this interface.
 */

export type TransportKind = 'bluetooth' | 'serial';

export interface PrinterDevice {
  /** Stable identifier: MAC address (Bluetooth) or port path (serial). */
  id: string;
  name?: string;
  kind: TransportKind;
}

export interface ReadOptions {
  /** Read exactly this many bytes (used for fixed-length responses). */
  length?: number;
  /** Otherwise read until idle, giving up after this many ms. */
  timeoutMs?: number;
}

export interface PrinterTransport {
  /** Human-readable transport name, for diagnostics. */
  readonly name: string;

  /** Discover candidate devices (bonded BT devices / serial ports). */
  listDevices(): Promise<PrinterDevice[]>;

  connect(device: PrinterDevice): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  /** Binary-safe write of a fully-formed command payload. */
  write(data: Uint8Array): Promise<void>;

  /** Read a response (fixed length or until idle). */
  read(options?: ReadOptions): Promise<Uint8Array>;
}

/**
 * Write a command then read its response, mirroring the Python
 * `send_command()` request/response pattern.
 */
export async function transceive(
  transport: PrinterTransport,
  data: Uint8Array,
  read?: ReadOptions,
): Promise<Uint8Array> {
  await transport.write(data);
  return transport.read(read);
}

export class TransportNotImplementedError extends Error {
  constructor(platform: string) {
    super(`Printer transport for "${platform}" is not implemented yet.`);
    this.name = 'TransportNotImplementedError';
  }
}
