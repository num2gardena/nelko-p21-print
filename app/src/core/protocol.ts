/**
 * Nelko P21 protocol: command builders and response parsers.
 * Ported from src/nelko_p21_print/__init__.py (the TSPL2 subset the P21 uses).
 *
 * NOTE: writes must be binary-safe. The BITMAP payload contains 0x1b/0x0d/0x0a
 * bytes, so commands are produced as Uint8Array, never strings.
 */

import { validateChecksum } from './crc16';
import { bytesPerRow, type LabelSpec } from './labels';
import {
  BeepSetting,
  PaperColor,
  PaperType,
  PrinterReadinessStatus,
  TimeoutSetting,
  type BatteryData,
  type DeviceConfig,
  type PrinterStatus,
} from './types';

const CRLF = '\r\n';

/** Encode an ASCII/latin1 command string to bytes (no UTF-8 expansion). */
export function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

/** Encode a command string and append CRLF, mirroring `send_command(encode=True)`. */
export function encodeCommand(command: string): Uint8Array {
  return latin1(command + CRLF);
}

export function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

// --- Query / control commands -------------------------------------------------

/** ESC !o — cancel pause + return 16-byte status. */
export const CMD_STATUS = '\x1b!o';
/** ESC !? — return 1-byte readiness status. */
export const CMD_READINESS = '\x1b!?';
export const CMD_CONFIG = 'CONFIG?';
export const CMD_BATTERY = 'BATTERY?';
export const CMD_SELFTEST = 'SELFTEST';

export function buildTimeoutCommand(setting: TimeoutSetting): Uint8Array {
  return encodeCommand(`TIMEOUT ${String.fromCharCode(setting)}`);
}

export function buildBeepCommand(beep: boolean): Uint8Array {
  const setting = beep ? BeepSetting.ON : BeepSetting.OFF;
  return encodeCommand(`BEEP ${String.fromCharCode(setting)}`);
}

/**
 * Build the full print command for a 1-bit bitmap payload.
 * Port of `build_print_command`, parameterised by the active label spec.
 */
export function buildPrintCommand(
  imageData: Uint8Array,
  spec: LabelSpec,
  density: number,
  copies: number,
): Uint8Array {
  const header = latin1(
    `${CMD_STATUS}${CRLF}` +
      `SIZE ${spec.widthMm.toFixed(1)} mm,${spec.lengthMm.toFixed(1)} mm${CRLF}` +
      `GAP ${spec.gapMm.toFixed(1)} mm,0 mm${CRLF}` +
      `DIRECTION 1,1${CRLF}` +
      `DENSITY ${density}${CRLF}` +
      `CLS${CRLF}` +
      `BITMAP 0,0,${bytesPerRow(spec)},${spec.printHeightDots},1,`,
  );
  const footer = latin1(`${CRLF}PRINT ${copies}${CRLF}`);
  return concatBytes(header, imageData, footer);
}

// --- Response parsers ---------------------------------------------------------

/**
 * Strip a textual prefix and the trailing CRLF from a response and assert the
 * remaining length. Port of `clean_serial_response`.
 */
function cleanResponse(
  response: Uint8Array,
  prefix: string,
  expectedLen: number,
): Uint8Array {
  const prefixBytes = latin1(prefix);
  const body = response.subarray(prefix.length, response.length - 2);
  const startsWith = prefixBytes.every((b, i) => response[i] === b);
  if (!startsWith || body.length !== expectedLen) {
    throw new Error(`Invalid response (prefix ${prefix})`);
  }
  return body;
}

export function parseReadiness(response: Uint8Array): PrinterReadinessStatus {
  return response[0] as PrinterReadinessStatus;
}

/** Parse the 16-byte ESC !o status (last 2 bytes are the CRC16). */
export function parseStatus(response: Uint8Array): PrinterStatus {
  validateChecksum(response);
  const d = response;
  const labelWidthMm = d[13];
  const labelLengthMm = d[11];
  return {
    readiness: d[0] as PrinterReadinessStatus,
    labelColor: d[4] as PaperColor,
    paperType: d[7] as PaperType,
    labelWidthMm,
    labelLengthMm,
    maximumLabelWidthMm: d[12],
    borderRadius: d[6],
    noRfidTag: labelWidthMm === 0 && labelLengthMm === 0,
  };
}

/** Parse a `CONFIG?` response (`CONFIG ` + 10 bytes + CRLF). */
export function parseConfig(response: Uint8Array): DeviceConfig {
  const b = cleanResponse(response, 'CONFIG ', 10);
  const dpi = (b[0] << 8) | b[1]; // big-endian int16
  return {
    dpiResolution: dpi,
    hardwareVersion: `${b[2]}.${b[3]}.${b[4]}`,
    secondFirmwareVersion: `${b[5]}.${b[6]}.${b[7]}`,
    timeout: b[8] as TimeoutSetting,
    beep: b[9] as BeepSetting,
  };
}

/** Parse a `BATTERY?` response (`BATTERY ` + 2 bytes + CRLF). */
export function parseBattery(response: Uint8Array): BatteryData {
  const b = cleanResponse(response, 'BATTERY ', 2);
  // First byte is the level encoded as BCD.
  const level = ((b[0] >> 4) & 0x0f) * 10 + (b[0] & 0x0f);
  return { level, charging: b[1] !== 0 };
}
