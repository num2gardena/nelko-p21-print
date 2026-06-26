/**
 * Image pipeline: turn a rendered label into the printer's 1-bit bitmap payload.
 *
 * Bit-exact port of `load_image()` from src/nelko_p21_print/__init__.py and the
 * underlying PIL (Pillow 12.x) operations:
 *   grayscale (ITU-R 601-2 luma) -> autocontrast -> contrast x2 ->
 *   rotate-to-portrait (90 CCW) -> nearest thumbnail -> Floyd-Steinberg dither ->
 *   pack to mode "1" bytes (MSB = left pixel, bit set = white) -> pad with 0xFF.
 *
 * Each stage is a pure function so it can be unit-tested in Node against golden
 * vectors generated from the Python reference (see tools/gen_reference.py and
 * app/test/imaging.test.ts).
 */

import { bitmapByteLength, type LabelSpec } from './labels';

export interface GrayImage {
  data: Uint8Array; // one byte (0..255) per pixel, row-major
  width: number;
  height: number;
}

const WHITE_PAD = 0xff;

/** PIL CLIP8: v <= 0 ? 0 : v < 256 ? v : 255. */
function clip8(v: number): number {
  return v <= 0 ? 0 : v < 256 ? v : 255;
}

/**
 * RGBA -> grayscale using PIL's exact integer luma transform:
 *   L = (R*19595 + G*38470 + B*7471 + 0x8000) >> 16
 * Alpha is ignored, matching PIL's convert("L").
 */
export function rgbaToGray(rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
  const n = rgba.length >> 2;
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const p = i << 2;
    out[i] = (rgba[p] * 19595 + rgba[p + 1] * 38470 + rgba[p + 2] * 7471 + 0x8000) >> 16;
  }
  return out;
}

/**
 * PIL ImageOps.autocontrast (cutoff=0): stretch so the darkest used value maps
 * to 0 and the lightest to 255.
 */
export function autocontrast(gray: Uint8Array): Uint8Array {
  const histogram = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) histogram[gray[i]]++;

  let lo = 0;
  while (lo < 256 && histogram[lo] === 0) lo++;
  let hi = 255;
  while (hi >= 0 && histogram[hi] === 0) hi--;

  const lut = new Uint8Array(256);
  if (hi <= lo) {
    for (let i = 0; i < 256; i++) lut[i] = i;
  } else {
    const scale = 255.0 / (hi - lo);
    const offset = -lo * scale;
    for (let i = 0; i < 256; i++) {
      // Python int() truncates toward zero, then clamp to 0..255.
      lut[i] = clip8(Math.trunc(i * scale + offset));
    }
  }

  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = lut[gray[i]];
  return out;
}

/**
 * PIL ImageEnhance.Contrast(image).enhance(factor).
 * out = clip(factor*pixel + (1-factor)*mean), mean = round(avg) (half up).
 * For the default factor of 2 this is clip(2*pixel - mean).
 */
export function contrast(gray: Uint8Array, factor = 2): Uint8Array {
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = Math.floor(sum / gray.length + 0.5); // int(mean + 0.5)

  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    // PIL Image.blend extrapolation: clip(floor(in1 + factor*(in2 - in1))).
    out[i] = clip8(Math.trunc(mean + factor * (gray[i] - mean)));
  }
  return out;
}

/**
 * Rotate 90 degrees counter-clockwise with expand, matching PIL rotate(90).
 * dst(dx,dy) = src(srcW-1-dy, dx); dst is srcH wide, srcW tall.
 */
export function rotate90CCW(img: GrayImage): GrayImage {
  const { data, width: w, height: h } = img;
  const out = new Uint8Array(w * h);
  const dstW = h;
  const dstH = w;
  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      out[dy * dstW + dx] = data[dx * w + (w - 1 - dy)];
    }
  }
  return { data: out, width: dstW, height: dstH };
}

/**
 * Rotate 90 degrees clockwise with expand (the inverse of rotate90CCW).
 * Used to display the print-orientation dither back in the editing orientation.
 * dst(dx,dy) = src(dy, srcH-1-dx); dst is srcH wide, srcW tall.
 */
export function rotate90CW(img: GrayImage): GrayImage {
  const { data, width: w, height: h } = img;
  const out = new Uint8Array(w * h);
  const dstW = h;
  const dstH = w;
  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      out[dy * dstW + dx] = data[(h - 1 - dx) * w + dy];
    }
  }
  return { data: out, width: dstW, height: dstH };
}

/**
 * PIL Image.thumbnail with NEAREST resampling: shrink to fit within
 * (maxW, maxH) preserving aspect ratio. Never enlarges.
 *
 * NOTE: when the image already fits this is an exact no-op (the only case the
 * parity tests exercise, since label sources are authored at target size). The
 * actual shrink path below uses straightforward nearest sampling and is not yet
 * validated bit-for-bit against PIL's NEAREST resize.
 */
export function thumbnailNearest(
  img: GrayImage,
  maxW: number,
  maxH: number,
): GrayImage {
  const { width: w, height: h } = img;
  if (w <= maxW && h <= maxH) return img; // no-op, matches PIL

  const scale = Math.min(maxW / w, maxH / h);
  const newW = Math.max(Math.round(w * scale), 1);
  const newH = Math.max(Math.round(h * scale), 1);

  const out = new Uint8Array(newW * newH);
  for (let y = 0; y < newH; y++) {
    const sy = Math.min(h - 1, Math.floor((y * h) / newH));
    for (let x = 0; x < newW; x++) {
      const sx = Math.min(w - 1, Math.floor((x * w) / newW));
      out[y * newW + x] = img.data[sy * w + sx];
    }
  }
  return { data: out, width: newW, height: newH };
}

/**
 * Floyd-Steinberg dither to bilevel, bit-exact port of PIL's `tobilevel`
 * (Convert.c, bands == 1). Returns 0/255 per pixel.
 */
export function floydSteinberg1bit(img: GrayImage): Uint8Array {
  const { data, width: w, height: h } = img;
  const out = new Uint8Array(w * h);
  const errors = new Int32Array(w + 1); // persists across rows, zero-initialised

  for (let y = 0; y < h; y++) {
    let l = 0;
    let l0 = 0;
    let l1 = 0;
    const row = y * w;
    for (let x = 0; x < w; x++) {
      // pick closest colour (C integer division truncates toward zero)
      l = clip8(data[row + x] + Math.trunc((l + errors[x + 1]) / 16));
      const o = l > 128 ? 255 : 0;
      out[row + x] = o;

      // propagate errors
      l -= o;
      const l2 = l;
      const d2 = l + l;
      l += d2;
      errors[x] = l + l0;
      l += d2;
      l0 = l + l1;
      l1 = l2;
      l += d2;
    }
    errors[w] = l0;
  }
  return out;
}

/**
 * Pack a 0/255 bilevel image into mode "1" bytes: 8 pixels per byte, MSB =
 * left-most pixel, set bit = white (255). Rows are byte-aligned.
 */
export function packBilevel(img: GrayImage): Uint8Array {
  const { data, width: w, height: h } = img;
  const rowBytes = Math.ceil(w / 8);
  const out = new Uint8Array(rowBytes * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[y * w + x] !== 0) {
        out[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  return out;
}

/**
 * Pipeline options. `enhance` toggles the autocontrast + contrast steps that
 * `load_image()` always applies (good for arbitrary photo input, optional for
 * already black-and-white WYSIWYG designs). Defaults to true for parity.
 */
export interface PipelineOptions {
  enhance?: boolean;
}

/**
 * Run the pipeline up to (and including) the Floyd-Steinberg dither, returning
 * the bilevel image in *print orientation* (0/255 per pixel). Shared by the
 * printer payload builder and the live preview.
 */
export function loadImageMono(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  spec: LabelSpec,
  options: PipelineOptions = {},
): GrayImage {
  const enhance = options.enhance ?? true;

  let img: GrayImage = { data: rgbaToGray(rgba), width, height };
  if (enhance) {
    img = { data: autocontrast(img.data), width: img.width, height: img.height };
    img = { data: contrast(img.data, 2), width: img.width, height: img.height };
  }

  if (img.width > img.height) img = rotate90CCW(img);
  img = thumbnailNearest(img, spec.printWidthDots, spec.printHeightDots);

  return {
    data: floydSteinberg1bit(img),
    width: img.width,
    height: img.height,
  };
}

/**
 * Full pipeline: RGBA source -> printer bitmap payload, padded to the label's
 * byte length with 0xFF. Bit-exact equivalent of `load_image()`.
 */
export function loadImageBytes(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  spec: LabelSpec,
  options: PipelineOptions = {},
): Uint8Array {
  const mono = loadImageMono(rgba, width, height, spec, options);
  const packed = packBilevel(mono);

  const target = bitmapByteLength(spec);
  if (packed.length >= target) return packed;
  const out = new Uint8Array(target).fill(WHITE_PAD);
  out.set(packed, 0);
  return out;
}

/** Convenience wrapper for the app: render a Canvas ImageData to printer bytes. */
export function renderToBitmap(image: ImageData, spec: LabelSpec): Uint8Array {
  return loadImageBytes(image.data, image.width, image.height, spec);
}

/**
 * Dithered preview in the *editing* orientation: exactly the bytes the printer
 * receives, rotated back so the preview lines up with the editor canvas.
 */
export function previewMono(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  spec: LabelSpec,
  options: PipelineOptions = {},
): GrayImage {
  const mono = loadImageMono(rgba, width, height, spec, options);
  if (mono.width !== width || mono.height !== height) {
    return rotate90CW(mono);
  }
  return mono;
}

/** Expand a 0/255 bilevel image to an RGBA ImageData for display. */
export function monoToImageData(img: GrayImage): ImageData {
  const { data, width, height } = img;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i++) {
    const v = data[i]; // 0 (black) or 255 (white)
    const p = i << 2;
    rgba[p] = v;
    rgba[p + 1] = v;
    rgba[p + 2] = v;
    rgba[p + 3] = 255;
  }
  return new ImageData(rgba, width, height);
}
