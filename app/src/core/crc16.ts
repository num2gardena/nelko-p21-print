/**
 * CRC16 used by the Nelko P21 to checksum status responses.
 *
 * Faithful port of the Python `crc16()` in src/nelko_p21_print/__init__.py:
 * Modbus-style CRC16 (polynomial 0xA001, initial value 0xFFFF) with the
 * 16-bit result emitted big-endian.
 */
export function crc16(data: Uint8Array): Uint8Array {
  let crc = 0xffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x1) {
        crc = (crc >> 1) ^ 0xa001;
      } else {
        crc >>= 1;
      }
    }
  }
  // Emit as a 2-byte array in big-endian order.
  return new Uint8Array([(crc >> 8) & 0xff, crc & 0xff]);
}

/**
 * Validate that the last two bytes of `data` are a correct CRC16 over the
 * preceding bytes. Throws on mismatch, mirroring `validate_checksum()`.
 */
export function validateChecksum(data: Uint8Array): void {
  if (data.length < 2) {
    throw new Error(`Response too short to contain a checksum: ${toHex(data)}`);
  }
  const provided = data.subarray(data.length - 2);
  const computed = crc16(data.subarray(0, data.length - 2));
  if (provided[0] !== computed[0] || provided[1] !== computed[1]) {
    throw new Error(
      `Invalid checksum: ${toHex(provided)} != ${toHex(computed)}`,
    );
  }
}

function toHex(data: Uint8Array): string {
  return Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('');
}
