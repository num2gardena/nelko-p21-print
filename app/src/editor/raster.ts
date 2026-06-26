/**
 * Shared rasterisation: turn a fabric canvas (the live editor or an offscreen
 * batch canvas) into label-dot-resolution ImageData, the way the printer needs
 * it. Kept separate so the editor and the CSV batch renderer stay in sync.
 */
import type { StaticCanvas } from 'fabric';
import type { LabelSpec } from '../core';

/** On-screen pixels per printer dot while editing (display only). */
export const DISPLAY_SCALE = 3;

/** The editor canvas is the label's printable area shown landscape. */
export function editDimensions(spec: LabelSpec): { w: number; h: number } {
  return { w: spec.printHeightDots, h: spec.printWidthDots };
}

/**
 * Render a fabric canvas straight to label-dot resolution (no selection
 * controls). Rendering directly at target size — rather than rasterising at
 * DISPLAY_SCALE and bilinear-downscaling — keeps edges crisp; QR/barcode
 * bitmaps stay sharp via their imageSmoothing:false flag.
 */
export function canvasToImageData(
  canvas: StaticCanvas,
  spec: LabelSpec,
): ImageData | null {
  const { w: editW, h: editH } = editDimensions(spec);
  const source = canvas.toCanvasElement(1 / DISPLAY_SCALE);
  const off = document.createElement('canvas');
  off.width = editW;
  off.height = editH;
  const ctx = off.getContext('2d');
  if (!ctx) return null;
  // White background: transparent pixels would otherwise grayscale to black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, editW, editH);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0, source.width, source.height, 0, 0, editW, editH);
  return ctx.getImageData(0, 0, editW, editH);
}
