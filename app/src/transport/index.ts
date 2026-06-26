/**
 * Transport factory — selects the right implementation for the current runtime.
 */
import { Capacitor } from '@capacitor/core';
import { AndroidSppTransport } from './android';
import { BridgeTransport, sameOriginBridgeUrl } from './bridge';
import { ElectronSerialTransport, isElectron } from './electron';
import type { PrinterTransport } from './PrinterTransport';
import { WebSerialTransport } from './webserial';

export * from './PrinterTransport';
export { AndroidSppTransport } from './android';
export { BridgeTransport, DEFAULT_BRIDGE_URL } from './bridge';
export { ElectronSerialTransport, isElectron } from './electron';
export { WebSerialTransport, isWebSerialSupported } from './webserial';

let cached: PrinterTransport | null = null;

export type WebTransportMethod = 'serial' | 'bridge';

const METHOD_KEY = 'nelko.transport';
const BRIDGE_URL_KEY = 'nelko.bridgeUrl';

/** Auto-detected default, overridden by an explicit user choice (localStorage). */
let autoMethod: WebTransportMethod = 'serial';

function explicitMethod(): WebTransportMethod | null {
  if (typeof localStorage !== 'undefined') {
    const value = localStorage.getItem(METHOD_KEY);
    if (value === 'serial' || value === 'bridge') return value;
  }
  return null;
}

/** The effective web connection method (explicit choice, else auto-detected). */
export function getWebTransportMethod(): WebTransportMethod {
  return explicitMethod() ?? autoMethod;
}

/** Pin the web connection method and force the transport to be recreated. */
export function setWebTransportMethod(method: WebTransportMethod): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(METHOD_KEY, method);
  cached = null;
}

/**
 * Probe the serving origin once: if it's our print-server (its `/api/health`
 * reports `bt: true`), default to the built-in Bluetooth pipe; otherwise to Web
 * Serial. An explicit user choice always wins, so this is a no-op then.
 */
export async function detectWebTransport(): Promise<WebTransportMethod> {
  const explicit = explicitMethod();
  if (explicit) return explicit;
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    const data = res.ok ? ((await res.json()) as { bt?: boolean }) : null;
    autoMethod = data?.bt ? 'bridge' : 'serial';
  } catch {
    autoMethod = 'serial';
  }
  cached = null;
  return autoMethod;
}

function bridgeUrl(): string {
  const override =
    typeof localStorage !== 'undefined' && localStorage.getItem(BRIDGE_URL_KEY);
  return override || sameOriginBridgeUrl();
}

function webTransport(): PrinterTransport {
  return getWebTransportMethod() === 'bridge'
    ? new BridgeTransport(bridgeUrl())
    : new WebSerialTransport();
}

/** Return (and memoise) the transport for the current platform. */
export function getTransport(): PrinterTransport {
  if (cached) return cached;

  // Electron is detected via the preload bridge, not Capacitor (which reports
  // "web" inside the Electron renderer).
  if (isElectron()) {
    cached = new ElectronSerialTransport();
  } else if (Capacitor.getPlatform() === 'android') {
    cached = new AndroidSppTransport();
  } else {
    cached = webTransport();
  }
  return cached;
}
