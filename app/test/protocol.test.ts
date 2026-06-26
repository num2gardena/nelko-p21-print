import { describe, expect, it } from 'vitest';
import { DEFAULT_LABEL } from '../src/core/labels';
import {
  buildBeepCommand,
  buildPrintCommand,
  buildTimeoutCommand,
  parseBattery,
  parseConfig,
  parseStatus,
} from '../src/core/protocol';
import { bytesToHex, hexToBytes, loadReference } from './helpers';

const ref = loadReference();
const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

describe('parseConfig', () => {
  it('matches the reference CONFIG? response', () => {
    const c = parseConfig(hexToBytes(ref.config.raw));
    expect(c.dpiResolution).toBe(ref.config.dpiResolution);
    expect(c.hardwareVersion).toBe(ref.config.hardwareVersion);
    expect(c.secondFirmwareVersion).toBe(ref.config.secondFirmwareVersion);
    expect(c.timeout).toBe(ref.config.timeout);
    expect(c.beep).toBe(ref.config.beep);
  });
});

describe('parseBattery', () => {
  for (const b of ref.battery) {
    it(`level ${b.level}%, charging=${b.charging}`, () => {
      const r = parseBattery(hexToBytes(b.raw));
      expect(r.level).toBe(b.level);
      expect(r.charging).toBe(b.charging);
    });
  }
});

describe('parseStatus', () => {
  for (const s of ref.status) {
    it(`readiness=${s.readiness}, ${s.labelWidthMm}x${s.labelLengthMm}mm`, () => {
      const r = parseStatus(hexToBytes(s.raw));
      expect(r.readiness).toBe(s.readiness);
      expect(r.labelColor).toBe(s.labelColor);
      expect(r.paperType).toBe(s.paperType);
      expect(r.labelWidthMm).toBe(s.labelWidthMm);
      expect(r.labelLengthMm).toBe(s.labelLengthMm);
      expect(r.maximumLabelWidthMm).toBe(s.maximumLabelWidthMm);
      expect(r.borderRadius).toBe(s.borderRadius);
      expect(r.noRfidTag).toBe(s.noRfidTag);
    });
  }
});

describe('command builders', () => {
  it('buildPrintCommand reproduces the TSPL2 sequence', () => {
    const image = new Uint8Array(3408).fill(0xff);
    const cmd = buildPrintCommand(image, DEFAULT_LABEL, 15, 2);
    const text = new TextDecoder('latin1').decode(cmd);

    expect(text.startsWith('\x1b!o\r\n')).toBe(true);
    expect(text).toContain('SIZE 14.0 mm,40.0 mm\r\n');
    expect(text).toContain('GAP 5.0 mm,0 mm\r\n');
    expect(text).toContain('DIRECTION 1,1\r\n');
    expect(text).toContain('DENSITY 15\r\n');
    expect(text).toContain('CLS\r\n');
    expect(text).toContain('BITMAP 0,0,12,284,1,');
    expect(text.endsWith('\r\nPRINT 2\r\n')).toBe(true);

    // Header + 3408-byte payload + footer, with no corruption of the payload.
    const headerLen = text.indexOf('BITMAP 0,0,12,284,1,') + 'BITMAP 0,0,12,284,1,'.length;
    expect(cmd.length).toBe(headerLen + 3408 + '\r\nPRINT 2\r\n'.length);
  });

  it('buildTimeoutCommand encodes the setting byte', () => {
    expect(bytesToHex(buildTimeoutCommand(2))).toBe(
      bytesToHex(latin1('TIMEOUT \x02\r\n')),
    );
  });

  it('buildBeepCommand encodes on/off', () => {
    expect(bytesToHex(buildBeepCommand(true))).toBe(bytesToHex(latin1('BEEP \x01\r\n')));
    expect(bytesToHex(buildBeepCommand(false))).toBe(bytesToHex(latin1('BEEP \x00\r\n')));
  });
});
