/**
 * Preload bridge. Runs sandboxed with contextIsolation, so it only uses
 * `electron` APIs and exposes a minimal, typed surface on `window.nelko`.
 *
 * Channel strings are kept in sync with src/shared.ts (a sandboxed preload
 * cannot import local modules at runtime).
 */
import { contextBridge, ipcRenderer } from 'electron';

const Channels = {
  list: 'serial:list',
  open: 'serial:open',
  write: 'serial:write',
  read: 'serial:read',
  close: 'serial:close',
  isOpen: 'serial:isOpen',
} as const;

const api = {
  isElectron: true as const,
  platform: process.platform,
  serial: {
    list: () => ipcRenderer.invoke(Channels.list),
    open: (opts: { path: string; baudRate?: number }) =>
      ipcRenderer.invoke(Channels.open, opts),
    write: (data: Uint8Array) => ipcRenderer.invoke(Channels.write, data),
    read: (req: { length?: number; timeoutMs?: number }) =>
      ipcRenderer.invoke(Channels.read, req),
    close: () => ipcRenderer.invoke(Channels.close),
    isOpen: () => ipcRenderer.invoke(Channels.isOpen),
  },
};

contextBridge.exposeInMainWorld('nelko', api);

export type NelkoBridge = typeof api;
