import { describe, expect, it } from 'vitest';
import { crc16, validateChecksum } from '../src/core/crc16';
import { assertBytesEqual, hexToBytes, loadReference } from './helpers';

const ref = loadReference();

describe('crc16', () => {
  for (const v of ref.crc16) {
    it(`crc16(${v.data || '<empty>'}) parity`, () => {
      assertBytesEqual(crc16(hexToBytes(v.data)), v.crc);
    });
  }

  it('matches CRC-16/MODBUS check value (123456789 -> 0x4B37)', () => {
    const bytes = new TextEncoder().encode('123456789');
    assertBytesEqual(crc16(bytes), '4b37');
  });
});

describe('validateChecksum', () => {
  const data = hexToBytes('0102030405');
  const valid = new Uint8Array([...data, ...crc16(data)]);

  it('accepts a correct checksum', () => {
    expect(() => validateChecksum(valid)).not.toThrow();
  });

  it('rejects a corrupted payload', () => {
    const bad = valid.slice();
    bad[0] ^= 0xff;
    expect(() => validateChecksum(bad)).toThrow(/checksum/i);
  });
});
