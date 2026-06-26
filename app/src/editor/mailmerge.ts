/**
 * CSV-driven batch rendering. The current design is the template; text objects
 * containing {{column}} tokens are filled from each CSV row, and rendered to a
 * label ImageData (for printing) or a PNG data URL (for export).
 */
import { StaticCanvas } from 'fabric';
import Papa from 'papaparse';
import * as QRCode from 'qrcode';
import { type LabelSpec } from '../core';
import { canvasToImageData, DISPLAY_SCALE, editDimensions } from './raster';

export interface CsvData {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCsv(file: File): Promise<CsvData> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) =>
        resolve({ headers: res.meta.fields ?? [], rows: res.data }),
      error: (err) => reject(err),
    });
  });
}

const TOKEN = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Replace {{column}} placeholders with this row's values. */
export function mergeText(template: string, row: Record<string, string>): string {
  return template.replace(TOKEN, (_, key: string) => row[key.trim()] ?? '');
}

const hasToken = (s: string) => s.includes('{{');

const CRISP = { imageSmoothing: false, objectCaching: false } as const;

async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text || ' ', { margin: 1, scale: 8 });
}

async function barcodeDataUrl(text: string): Promise<string> {
  const { toCanvas } = await import('bwip-js/browser');
  const off = document.createElement('canvas');
  toCanvas(off, {
    bcid: 'code128',
    text: text || '0',
    scale: 3,
    height: 10,
    includetext: true,
    textxalign: 'center',
  });
  return off.toDataURL('image/png');
}

interface FabricObj {
  text?: string;
  qrText?: string;
  barcodeText?: string;
  width?: number;
  scaleX?: number;
  set: (props: Record<string, unknown>) => void;
  setSrc?: (url: string) => Promise<unknown>;
  initDimensions?: () => void;
}

export interface RowRenderer {
  /** Label-dot-resolution ImageData for the printer pipeline. */
  render(row: Record<string, string>): Promise<ImageData | null>;
  /** Editor-resolution PNG data URL for export. */
  toDataUrl(row: Record<string, string>): Promise<string>;
  dispose(): void;
}

/**
 * Load the design once into an offscreen canvas and return a renderer that, per
 * CSV row, substitutes {{token}} text and regenerates any QR/barcode whose
 * source contains tokens. Static objects are rendered once and reused.
 */
export async function createRowRenderer(
  designJson: string,
  spec: LabelSpec,
): Promise<RowRenderer> {
  const { w, h } = editDimensions(spec);
  const canvas = new StaticCanvas(document.createElement('canvas'), {
    width: w * DISPLAY_SCALE,
    height: h * DISPLAY_SCALE,
    backgroundColor: '#ffffff',
    enableRetinaScaling: false,
  });
  await canvas.loadFromJSON(designJson);
  canvas.backgroundColor = '#ffffff';

  const objs = canvas.getObjects() as unknown as FabricObj[];

  const texts = objs
    .filter((o) => typeof o.text === 'string')
    .map((o) => ({ obj: o, template: o.text as string }));

  // QR codes keep a constant on-label size (display px captured now), so denser
  // payloads just shrink the modules rather than resize the symbol.
  const qrs = objs
    .filter((o) => typeof o.qrText === 'string' && hasToken(o.qrText))
    .map((o) => {
      o.set(CRISP);
      return {
        obj: o,
        template: o.qrText as string,
        display: (o.width ?? 1) * (o.scaleX ?? 1),
      };
    });

  // Barcodes keep their module size (scale) constant; width follows content.
  const barcodes = objs
    .filter((o) => typeof o.barcodeText === 'string' && hasToken(o.barcodeText))
    .map((o) => {
      o.set(CRISP);
      return { obj: o, template: o.barcodeText as string };
    });

  const apply = async (row: Record<string, string>) => {
    for (const { obj, template } of texts) {
      obj.set({ text: mergeText(template, row) });
      obj.initDimensions?.(); // reflow word-wrap / dimensions for the new text
    }
    for (const { obj, template, display } of qrs) {
      await obj.setSrc?.(await qrDataUrl(mergeText(template, row)));
      const scale = display / (obj.width ?? 1);
      obj.set({ scaleX: scale, scaleY: scale, ...CRISP });
    }
    for (const { obj, template } of barcodes) {
      await obj.setSrc?.(await barcodeDataUrl(mergeText(template, row)));
      obj.set(CRISP);
    }
    canvas.renderAll();
  };

  return {
    async render(row) {
      await apply(row);
      return canvasToImageData(canvas, spec);
    },
    async toDataUrl(row) {
      await apply(row);
      return canvas.toDataURL({ format: 'png', multiplier: 1 });
    },
    dispose() {
      void canvas.dispose();
    },
  };
}
