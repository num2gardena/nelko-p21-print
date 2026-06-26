/**
 * High-level printer operations, combining the transport, protocol and imaging
 * layers. Mirrors the command/response behaviour (and fixed response lengths)
 * of the Python CLI's send_command().
 */
import {
  buildBeepCommand,
  buildPrintCommand,
  buildTimeoutCommand,
  CMD_BATTERY,
  CMD_CONFIG,
  CMD_READINESS,
  CMD_SELFTEST,
  CMD_STATUS,
  encodeCommand,
  loadImageBytes,
  parseBattery,
  parseConfig,
  parseReadiness,
  parseStatus,
  validateChecksum,
  type BatteryData,
  type DeviceConfig,
  type LabelSpec,
  type PipelineOptions,
  type PrinterReadinessStatus,
  type PrinterStatus,
  type TimeoutSetting,
} from '../core';
import { getTransport, transceive, type PrinterDevice } from '../transport';

// Expected response lengths (bytes), matching the Python implementation.
const LEN_STATUS = 16;
const LEN_READINESS = 1;
const LEN_CONFIG = 19; // "CONFIG " + 10 + CRLF
const LEN_BATTERY = 12; // "BATTERY " + 2 + CRLF

class PrinterService {
  private get transport() {
    return getTransport();
  }

  get transportName(): string {
    return this.transport.name;
  }

  isConnected(): boolean {
    return this.transport.isConnected();
  }

  listDevices(): Promise<PrinterDevice[]> {
    return this.transport.listDevices();
  }

  connect(device: PrinterDevice): Promise<void> {
    return this.transport.connect(device);
  }

  disconnect(): Promise<void> {
    return this.transport.disconnect();
  }

  async getStatus(): Promise<PrinterStatus> {
    const resp = await transceive(this.transport, encodeCommand(CMD_STATUS), {
      length: LEN_STATUS,
    });
    return parseStatus(resp);
  }

  async getReadiness(): Promise<PrinterReadinessStatus> {
    const resp = await transceive(this.transport, encodeCommand(CMD_READINESS), {
      length: LEN_READINESS,
    });
    return parseReadiness(resp);
  }

  async getConfig(): Promise<DeviceConfig> {
    const resp = await transceive(this.transport, encodeCommand(CMD_CONFIG), {
      length: LEN_CONFIG,
    });
    return parseConfig(resp);
  }

  async getBattery(): Promise<BatteryData> {
    const resp = await transceive(this.transport, encodeCommand(CMD_BATTERY), {
      length: LEN_BATTERY,
    });
    return parseBattery(resp);
  }

  async setTimeout(setting: TimeoutSetting): Promise<void> {
    await this.transport.write(buildTimeoutCommand(setting));
    await this.drain();
  }

  async setBeep(on: boolean): Promise<void> {
    await this.transport.write(buildBeepCommand(on));
    await this.drain();
  }

  async selfTest(): Promise<void> {
    await this.transport.write(encodeCommand(CMD_SELFTEST));
  }

  /** Render and print an image; returns the printer status reply if available. */
  async print(
    image: ImageData,
    spec: LabelSpec,
    density: number,
    copies: number,
    options?: PipelineOptions,
  ): Promise<PrinterStatus | null> {
    const bytes = loadImageBytes(
      image.data,
      image.width,
      image.height,
      spec,
      options,
    );
    const command = buildPrintCommand(bytes, spec, density, copies);
    const resp = await transceive(this.transport, command, {
      length: LEN_STATUS,
    });
    if (resp.length >= LEN_STATUS) {
      validateChecksum(resp);
      return parseStatus(resp);
    }
    return null;
  }

  /** Consume and discard any pending response bytes. */
  private async drain(): Promise<void> {
    try {
      await this.transport.read({ timeoutMs: 300 });
    } catch {
      // ignore
    }
  }
}

export const printer = new PrinterService();
