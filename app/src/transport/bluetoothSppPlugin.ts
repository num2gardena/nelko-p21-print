import { registerPlugin, type PermissionState } from '@capacitor/core';

export interface SppDevice {
  id: string; // MAC address
  name?: string;
}

export interface SppPermissionStatus {
  bluetooth: PermissionState;
}

/**
 * JS bridge to the custom Android `BluetoothSpp` plugin
 * (android/app/src/main/java/de/fewenk/nelkop21/BluetoothSppPlugin.kt).
 * Binary payloads are base64-encoded strings.
 */
export interface BluetoothSppPlugin {
  listDevices(): Promise<{ devices: SppDevice[] }>;
  connect(options: { address: string }): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): Promise<{ connected: boolean }>;
  write(options: { data: string }): Promise<void>;
  read(options: { length?: number; timeoutMs?: number }): Promise<{ data: string }>;
  checkPermissions(): Promise<SppPermissionStatus>;
  requestPermissions(): Promise<SppPermissionStatus>;
}

export const BluetoothSpp = registerPlugin<BluetoothSppPlugin>('BluetoothSpp');
