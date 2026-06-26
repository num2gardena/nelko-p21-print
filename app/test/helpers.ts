import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';

export interface ImageStage {
  width: number;
  height: number;
  data: string;
}

export interface ImageReference {
  name: string;
  width: number;
  height: number;
  rgba: string;
  gray: string;
  autocontrast: string;
  contrast: string;
  rotated: ImageStage;
  resized: ImageStage;
  dithered_l: string;
  final: string;
}

export interface Reference {
  crc16: { data: string; crc: string }[];
  config: {
    raw: string;
    dpiResolution: number;
    hardwareVersion: string;
    secondFirmwareVersion: string;
    timeout: number;
    beep: number;
  };
  battery: { raw: string; level: number; charging: boolean }[];
  status: {
    raw: string;
    readiness: number;
    labelColor: number;
    paperType: number;
    labelLengthMm: number;
    maximumLabelWidthMm: number;
    labelWidthMm: number;
    borderRadius: number;
    noRfidTag: boolean;
  }[];
  images: ImageReference[];
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

let cached: Reference | null = null;

export function loadReference(): Reference {
  if (!cached) {
    const url = new URL('./fixtures/reference.json', import.meta.url);
    cached = JSON.parse(readFileSync(fileURLToPath(url), 'utf-8')) as Reference;
  }
  return cached;
}

/** Compare bytes against a hex reference, reporting the first differing byte. */
export function assertBytesEqual(actual: Uint8Array, expectedHex: string): void {
  const expected = hexToBytes(expectedHex);
  expect(actual.length, 'byte length').toBe(expected.length);
  let firstDiff = -1;
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      firstDiff = i;
      break;
    }
  }
  const msg =
    firstDiff === -1
      ? 'match'
      : `first diff at byte ${firstDiff}: got ${actual[firstDiff]} want ${expected[firstDiff]} (len ${expected.length})`;
  expect(firstDiff, msg).toBe(-1);
}
