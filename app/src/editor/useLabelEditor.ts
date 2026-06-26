import { useCallback, useEffect, useRef } from 'react';
import { Canvas, FabricImage, Rect, Textbox } from 'fabric';
import * as QRCode from 'qrcode';
import type { LabelSpec } from '../core';
import { canvasToImageData, DISPLAY_SCALE, editDimensions } from './raster';

export { DISPLAY_SCALE } from './raster';

export interface LabelEditorApi {
  addText(text?: string): void;
  addRect(): void;
  addQr(text: string): Promise<void>;
  addBarcode(text: string): Promise<void>;
  addImageFromFile(file: File): Promise<void>;
  deleteSelected(): void;
  clear(): void;
  /** Rasterise the design at exact label-dot resolution (editing orientation). */
  getImageData(): ImageData | null;
  /** Serialise the whole canvas (objects + background) to a JSON string. */
  toJSON(): string;
  /** Replace the canvas contents from a serialised design; marks it clean. */
  loadJSON(json: string): Promise<void>;
}

export function useLabelEditor(
  spec: LabelSpec,
  onChange: () => void,
  onDirtyChange: (dirty: boolean) => void,
): { canvasElRef: React.RefObject<HTMLCanvasElement | null>; api: LabelEditorApi } {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onDirtyRef = useRef(onDirtyChange);
  onDirtyRef.current = onDirtyChange;
  // True while we mutate the canvas programmatically (load / new), so those
  // changes are not counted as user edits for the dirty flag.
  const loadingRef = useRef(false);

  const { w: editW, h: editH } = editDimensions(spec);

  useEffect(() => {
    const el = canvasElRef.current;
    if (!el) return;

    const canvas = new Canvas(el, {
      width: editW * DISPLAY_SCALE,
      height: editH * DISPLAY_SCALE,
      backgroundColor: '#ffffff',
      enableRetinaScaling: false,
      preserveObjectStacking: true,
    });
    fabricRef.current = canvas;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const notify = () => {
      if (!loadingRef.current) onDirtyRef.current(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(), 80);
    };
    for (const ev of [
      'object:added',
      'object:modified',
      'object:removed',
      'text:changed',
    ] as const) {
      canvas.on(ev, notify);
    }

    // Delete / Backspace removes the selection, unless a text object is being
    // edited or focus is in a form field.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const active = canvas.getActiveObject();
      if (active && (active as { isEditing?: boolean }).isEditing) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      const objects = canvas.getActiveObjects();
      if (objects.length === 0) return;
      e.preventDefault();
      for (const obj of objects) canvas.remove(obj);
      canvas.discardActiveObject();
      canvas.requestRenderAll();
    };
    window.addEventListener('keydown', onKeyDown);

    onChangeRef.current();

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown);
      fabricRef.current = null;
      void canvas.dispose();
    };
  }, [editW, editH]);

  const place = useCallback(
    (obj: Textbox | Rect | FabricImage) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      canvas.add(obj);
      canvas.setActiveObject(obj);
      canvas.requestRenderAll();
    },
    [],
  );

  const addText = useCallback(
    (text = 'Text') => {
      place(
        new Textbox(text, {
          left: 8 * DISPLAY_SCALE,
          top: 8 * DISPLAY_SCALE,
          fontSize: 16 * DISPLAY_SCALE,
          fontFamily: 'sans-serif',
          fill: '#000000',
          width: 120 * DISPLAY_SCALE,
        }),
      );
    },
    [place],
  );

  const addRect = useCallback(() => {
    place(
      new Rect({
        left: 10 * DISPLAY_SCALE,
        top: 10 * DISPLAY_SCALE,
        width: 60 * DISPLAY_SCALE,
        height: 30 * DISPLAY_SCALE,
        fill: 'transparent',
        stroke: '#000000',
        // 1 printer dot, kept constant on resize, so the border stays crisp
        // instead of rendering as a sub-pixel grey line.
        strokeWidth: DISPLAY_SCALE,
        strokeUniform: true,
      }),
    );
  }, [place]);

  const addImageFromDataUrl = useCallback(
    async (
      url: string,
      maxDots: number,
      crisp = false,
      meta?: Record<string, unknown>,
    ) => {
      const img = await FabricImage.fromURL(url);
      const native = img.width ?? 1;
      const scale = (maxDots * DISPLAY_SCALE) / native;
      img.set({ left: 8 * DISPLAY_SCALE, top: 8 * DISPLAY_SCALE, scaleX: scale, scaleY: scale });
      // Sharp binary art (QR/barcode): nearest-neighbour, no object cache.
      if (crisp) img.set({ imageSmoothing: false, objectCaching: false });
      // Template source kept on the object so batch merge can regenerate it.
      if (meta) img.set(meta);
      place(img);
    },
    [place],
  );

  const addQr = useCallback(
    async (text: string) => {
      const url = await QRCode.toDataURL(text || ' ', { margin: 1, scale: 8 });
      await addImageFromDataUrl(url, 80, true, { qrText: text });
    },
    [addImageFromDataUrl],
  );

  const addBarcode = useCallback(
    async (text: string) => {
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
      await addImageFromDataUrl(off.toDataURL('image/png'), 140, true, {
        barcodeText: text,
      });
    },
    [addImageFromDataUrl],
  );

  const addImageFromFile = useCallback(
    (file: File) =>
      new Promise<void>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          addImageFromDataUrl(String(reader.result), 120).then(resolve, reject);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      }),
    [addImageFromDataUrl],
  );

  const deleteSelected = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    for (const obj of canvas.getActiveObjects()) canvas.remove(obj);
    canvas.discardActiveObject();
    canvas.requestRenderAll();
  }, []);

  const clear = useCallback(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    loadingRef.current = true;
    canvas.remove(...canvas.getObjects());
    canvas.backgroundColor = '#ffffff';
    canvas.requestRenderAll();
    loadingRef.current = false;
    onDirtyRef.current(false);
    onChangeRef.current();
  }, []);

  const toJSON = useCallback((): string => {
    const canvas = fabricRef.current;
    // Include the QR/barcode source templates so batch merge can regenerate them.
    return canvas
      ? JSON.stringify(canvas.toObject(['qrText', 'barcodeText']))
      : '';
  }, []);

  const loadJSON = useCallback(async (json: string): Promise<void> => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    loadingRef.current = true;
    try {
      canvas.discardActiveObject();
      // Fabric parses the JSON string and rebuilds every object itself.
      await canvas.loadFromJSON(json);
      canvas.backgroundColor = '#ffffff';
      canvas.requestRenderAll();
    } finally {
      loadingRef.current = false;
    }
    onDirtyRef.current(false);
    onChangeRef.current();
  }, []);

  const getImageData = useCallback((): ImageData | null => {
    const canvas = fabricRef.current;
    if (!canvas) return null;
    return canvasToImageData(canvas, spec);
  }, [spec]);

  return {
    canvasElRef,
    api: {
      addText,
      addRect,
      addQr,
      addBarcode,
      addImageFromFile,
      deleteSelected,
      clear,
      getImageData,
      toJSON,
      loadJSON,
    },
  };
}
