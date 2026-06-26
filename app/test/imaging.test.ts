import { describe, expect, it } from 'vitest';
import { DEFAULT_LABEL } from '../src/core/labels';
import {
  autocontrast,
  contrast,
  floydSteinberg1bit,
  loadImageBytes,
  loadImageMono,
  previewMono,
  rgbaToGray,
  rotate90CCW,
  rotate90CW,
} from '../src/core/imaging';
import { assertBytesEqual, bytesToHex, hexToBytes, loadReference } from './helpers';

const ref = loadReference();

for (const img of ref.images) {
  describe(`imaging parity: ${img.name}`, () => {
    const rgba = hexToBytes(img.rgba);

    it('grayscale (ITU-R 601-2 luma)', () => {
      assertBytesEqual(rgbaToGray(rgba), img.gray);
    });

    it('autocontrast', () => {
      assertBytesEqual(autocontrast(hexToBytes(img.gray)), img.autocontrast);
    });

    it('contrast x2', () => {
      assertBytesEqual(contrast(hexToBytes(img.autocontrast), 2), img.contrast);
    });

    it('rotate 90 CCW (expand)', () => {
      const r = rotate90CCW({
        data: hexToBytes(img.contrast),
        width: img.width,
        height: img.height,
      });
      expect(r.width).toBe(img.rotated.width);
      expect(r.height).toBe(img.rotated.height);
      assertBytesEqual(r.data, img.rotated.data);
    });

    it('Floyd-Steinberg dither', () => {
      const mono = floydSteinberg1bit({
        data: hexToBytes(img.resized.data),
        width: img.resized.width,
        height: img.resized.height,
      });
      assertBytesEqual(mono, img.dithered_l);
    });

    it('full pipeline == Python load_image()', () => {
      const out = loadImageBytes(rgba, img.width, img.height, DEFAULT_LABEL);
      assertBytesEqual(out, img.final);
    });

    it('loadImageMono == dithered print-orientation image', () => {
      const mono = loadImageMono(rgba, img.width, img.height, DEFAULT_LABEL);
      expect(mono.width).toBe(img.resized.width);
      expect(mono.height).toBe(img.resized.height);
      assertBytesEqual(mono.data, img.dithered_l);
    });

    it('rotate90CW is the inverse of rotate90CCW', () => {
      const src = {
        data: hexToBytes(img.contrast),
        width: img.width,
        height: img.height,
      };
      const roundTrip = rotate90CW(rotate90CCW(src));
      expect(roundTrip.width).toBe(src.width);
      expect(roundTrip.height).toBe(src.height);
      assertBytesEqual(roundTrip.data, img.contrast);
    });

    it('previewMono returns the print dither in editing orientation', () => {
      const out = previewMono(rgba, img.width, img.height, DEFAULT_LABEL);
      expect(out.width).toBe(img.width);
      expect(out.height).toBe(img.height);
      // Same bytes the printer gets (dithered_l, portrait), rotated back.
      const expected = rotate90CW({
        data: hexToBytes(img.dithered_l),
        width: img.resized.width,
        height: img.resized.height,
      });
      assertBytesEqual(out.data, bytesToHex(expected.data));
    });
  });
}
