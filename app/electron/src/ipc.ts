import { ipcMain } from 'electron';
import { serialManager } from './serial';
import { SerialChannels, type OpenOptions, type ReadRequest } from './shared';

/** Wire the serial bridge to ipcMain. Call once after app is ready. */
export function registerSerialIpc(): void {
  ipcMain.handle(SerialChannels.list, () => serialManager.list());
  ipcMain.handle(SerialChannels.open, (_e, opts: OpenOptions) =>
    serialManager.open(opts),
  );
  ipcMain.handle(SerialChannels.write, (_e, data: Uint8Array) =>
    serialManager.write(data),
  );
  ipcMain.handle(SerialChannels.read, (_e, req: ReadRequest) =>
    serialManager.read(req),
  );
  ipcMain.handle(SerialChannels.close, () => serialManager.close());
  ipcMain.handle(SerialChannels.isOpen, () => serialManager.isOpen());
}
