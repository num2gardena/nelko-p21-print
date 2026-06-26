/**
 * Label geometry.
 *
 * The P21 is a 203 DPI (~8 dots/mm) printer. The printable bitmap area is
 * smaller than the physical label (there are margins), so a label is described
 * by both its physical size in mm and its printable area in dots.
 *
 * The only fully-characterised label so far is the default 14x40 mm roll, whose
 * printable bitmap is 96x284 dots (matching `BITMAP 0,0,12,284,1` and the
 * 3408-byte payload in the Python CLI). Other sizes are derived provisionally
 * and must be verified against real hardware / captures.
 */

import type { PrinterStatus } from './types';

export const PRINTER_DPI = 203;
export const DOTS_PER_MM = PRINTER_DPI / 25.4; // ~7.99

export interface LabelSpec {
  id: string;
  name: string;
  /** Physical label width in mm (the SIZE command's first argument). */
  widthMm: number;
  /** Physical label length in mm (the SIZE command's second argument). */
  lengthMm: number;
  /** Gap between labels in mm (the GAP command's first argument). */
  gapMm: number;
  /** Printable bitmap width in dots. */
  printWidthDots: number;
  /** Printable bitmap height in dots. */
  printHeightDots: number;
}

/** The default Nelko P21 roll, fully characterised from the captured traffic. */
export const DEFAULT_LABEL: LabelSpec = {
  id: '14x40',
  name: '14 x 40 mm',
  widthMm: 14,
  lengthMm: 40,
  gapMm: 5,
  printWidthDots: 96,
  printHeightDots: 284,
};

/** Built-in presets shown when no RFID tag can be read. */
export const LABEL_PRESETS: LabelSpec[] = [DEFAULT_LABEL];

/** Bytes per printed row (1 bit per dot, 8 dots per byte). */
export function bytesPerRow(spec: LabelSpec): number {
  return Math.ceil(spec.printWidthDots / 8);
}

/** Total bitmap payload length in bytes. */
export function bitmapByteLength(spec: LabelSpec): number {
  return bytesPerRow(spec) * spec.printHeightDots;
}

/**
 * Derive a LabelSpec from a printer status (RFID read).
 *
 * TODO(parity): the printable-dot area for arbitrary mm sizes is not yet
 * characterised. For now we return the known default when it matches (or when
 * no tag is present) and otherwise estimate the dot area from DOTS_PER_MM,
 * which still needs verification against hardware.
 */
export function deriveSpecFromStatus(status: PrinterStatus): LabelSpec {
  if (status.noRfidTag) return DEFAULT_LABEL;

  if (
    status.labelWidthMm === DEFAULT_LABEL.widthMm &&
    status.labelLengthMm === DEFAULT_LABEL.lengthMm
  ) {
    return DEFAULT_LABEL;
  }

  // Provisional estimate — see TODO above.
  return {
    id: `${status.labelWidthMm}x${status.labelLengthMm}`,
    name: `${status.labelWidthMm} x ${status.labelLengthMm} mm`,
    widthMm: status.labelWidthMm,
    lengthMm: status.labelLengthMm,
    gapMm: DEFAULT_LABEL.gapMm,
    printWidthDots: Math.round(status.labelWidthMm * DOTS_PER_MM),
    printHeightDots: Math.round(status.labelLengthMm * DOTS_PER_MM),
  };
}
