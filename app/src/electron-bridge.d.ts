/**
 * Ambient type for the Electron preload bridge exposed on `window.nelko`.
 * Mirrors electron/src/preload.ts. Present only in the Electron build.
 */

export interface NelkoSerialPortInfo {
  path: string;
  manufacturer?: string;
  friendlyName?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}

export interface NelkoSerialBridge {
  list(): Promise<NelkoSerialPortInfo[]>;
  open(opts: { path: string; baudRate?: number }): Promise<void>;
  write(data: Uint8Array): Promise<void>;
  read(req: { length?: number; timeoutMs?: number }): Promise<Uint8Array>;
  close(): Promise<void>;
  isOpen(): Promise<boolean>;
}

export interface NelkoBridge {
  isElectron: true;
  platform: string;
  serial: NelkoSerialBridge;
}

declare global {
  interface Window {
    nelko?: NelkoBridge;
  }
}
