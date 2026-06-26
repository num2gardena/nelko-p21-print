/** IPC channel names and payload types shared by the Electron main process. */

export const SerialChannels = {
  list: 'serial:list',
  open: 'serial:open',
  write: 'serial:write',
  read: 'serial:read',
  close: 'serial:close',
  isOpen: 'serial:isOpen',
} as const;

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  friendlyName?: string;
  serialNumber?: string;
  vendorId?: string;
  productId?: string;
}

export interface OpenOptions {
  path: string;
  baudRate?: number;
}

export interface ReadRequest {
  length?: number;
  timeoutMs?: number;
}
