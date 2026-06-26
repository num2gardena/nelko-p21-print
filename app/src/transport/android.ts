/**
 * Android transport — bridges the custom `BluetoothSpp` Capacitor plugin that
 * wraps an RFCOMM BluetoothSocket on the SPP UUID
 * 00001101-0000-1000-8000-00805F9B34FB. Binary payloads cross the bridge as
 * base64 strings.
 */
import { base64ToBytes, bytesToBase64 } from './base64';
import { BluetoothSpp } from './bluetoothSppPlugin';
import {
  type PrinterDevice,
  type PrinterTransport,
  type ReadOptions,
} from './PrinterTransport';

export class AndroidSppTransport implements PrinterTransport {
  readonly name = 'Android Bluetooth SPP';
  private connected = false;

  async listDevices(): Promise<PrinterDevice[]> {
    const { devices } = await BluetoothSpp.listDevices();
    return devices.map((d) => ({
      id: d.id,
      name: d.name,
      kind: 'bluetooth' as const,
    }));
  }

  async connect(device: PrinterDevice): Promise<void> {
    await BluetoothSpp.connect({ address: device.id });
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    await BluetoothSpp.disconnect();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async write(data: Uint8Array): Promise<void> {
    await BluetoothSpp.write({ data: bytesToBase64(data) });
  }

  async read(options?: ReadOptions): Promise<Uint8Array> {
    const { data } = await BluetoothSpp.read({
      length: options?.length,
      timeoutMs: options?.timeoutMs,
    });
    return base64ToBytes(data);
  }
}
