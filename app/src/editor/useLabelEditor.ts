import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, FabricImage, Rect, Textbox } from 'fabric';
import * as QRCode from 'qrcode';
import type { LabelSpec } from '../core';
import { canvasToImageData, DISPLAY_SCALE, editDimensions, PADDING } from './raster';

export { DISPLAY_SCALE } from './raster';

export interface SelectedObjectProps {
  type: 'textbox' | 'rect' | 'image' | 'qr' | 'barcode';
  left: number;
  top: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  // Text specific
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  underline?: boolean;
  linethrough?: boolean;
  textAlign?: string;
  // Rect specific
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  rx?: number;
  ry?: number;
  // QR / Barcode specific
  qrText?: string;
  barcodeText?: string;
}

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
  updateSelected(props: Partial<SelectedObjectProps>): Promise<void>;
}

function getObjectProps(obj: any): SelectedObjectProps | null {
  if (!obj) return null;

  const type = obj.type;
  let customType: SelectedObjectProps['type'] = type;
  if (type === 'image') {
    if ('qrText' in obj) {
      customType = 'qr';
    } else if ('barcodeText' in obj) {
      customType = 'barcode';
    }
  }

  const base = {
    type: customType,
    left: Math.round(obj.left / DISPLAY_SCALE),
    top: Math.round(obj.top / DISPLAY_SCALE),
    width: Math.round((obj.width * (obj.scaleX ?? 1)) / DISPLAY_SCALE),
    height: Math.round((obj.height * (obj.scaleY ?? 1)) / DISPLAY_SCALE),
    scaleX: obj.scaleX ?? 1,
    scaleY: obj.scaleY ?? 1,
    angle: Math.round(obj.angle ?? 0),
  };

  if (type === 'textbox') {
    return {
      ...base,
      text: obj.text ?? '',
      fontFamily: obj.fontFamily ?? 'sans-serif',
      fontSize: Math.round((obj.fontSize ?? 16) / DISPLAY_SCALE),
      fontWeight: obj.fontWeight ?? 'normal',
      fontStyle: obj.fontStyle ?? 'normal',
      underline: !!obj.underline,
      linethrough: !!obj.linethrough,
      textAlign: obj.textAlign ?? 'left',
    };
  }

  if (type === 'rect') {
    return {
      ...base,
      fill: obj.fill ?? 'transparent',
      stroke: obj.stroke ?? '#000000',
      strokeWidth: Math.round((obj.strokeWidth ?? 1) / DISPLAY_SCALE),
      rx: Math.round((obj.rx ?? 0) / DISPLAY_SCALE),
      ry: Math.round((obj.ry ?? 0) / DISPLAY_SCALE),
    };
  }

  if (customType === 'qr') {
    return {
      ...base,
      qrText: obj.qrText ?? '',
    };
  }

  if (customType === 'barcode') {
    return {
      ...base,
      barcodeText: obj.barcodeText ?? '',
    };
  }

  return base;
}

export function useLabelEditor(
  spec: LabelSpec,
  onChange: () => void,
  onDirtyChange: (dirty: boolean) => void,
): {
  canvasElRef: React.RefObject<HTMLCanvasElement | null>;
  selectedProps: SelectedObjectProps | null;
  api: LabelEditorApi;
} {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<Canvas | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onDirtyRef = useRef(onDirtyChange);
  onDirtyRef.current = onDirtyChange;
  // True while we mutate the canvas programmatically (load / new), so those
  // changes are not counted as user edits for the dirty flag.
  const loadingRef = useRef(false);

  const [selectedProps, setSelectedProps] = useState<SelectedObjectProps | null>(null);

  const { w: editW, h: editH } = editDimensions(spec);

  useEffect(() => {
    const el = canvasElRef.current;
    if (!el) return;

    const canvas = new Canvas(el, {
      width: (editW + 2 * PADDING) * DISPLAY_SCALE,
      height: (editH + 2 * PADDING) * DISPLAY_SCALE,
      backgroundColor: 'transparent',
      enableRetinaScaling: false,
      preserveObjectStacking: true,
      viewportTransform: [1, 0, 0, 1, PADDING * DISPLAY_SCALE, PADDING * DISPLAY_SCALE],
    });
    
    setTimeout(() => {
      canvas.setViewportTransform([1, 0, 0, 1, PADDING * DISPLAY_SCALE, PADDING * DISPLAY_SCALE]);
      canvas.requestRenderAll();
    }, 0);

    canvas.on('before:render', (opt) => {
      const ctx = opt.ctx;
      ctx.save();
      
      const tx = canvas.viewportTransform ? canvas.viewportTransform[4] : 0;
      const ty = canvas.viewportTransform ? canvas.viewportTransform[5] : 0;
      
      // Draw a soft drop shadow for the physical label block
      ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 2;
      
      // Fill the label background white (at the transformed coordinates)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(tx, ty, editW * DISPLAY_SCALE, editH * DISPLAY_SCALE);
      
      // Turn off shadow for the border
      ctx.shadowColor = 'transparent';
      
      // Draw a subtle border around the label boundary
      ctx.strokeStyle = '#cccccc';
      ctx.lineWidth = 1;
      ctx.strokeRect(tx, ty, editW * DISPLAY_SCALE, editH * DISPLAY_SCALE);
      
      ctx.restore();
    });

    fabricRef.current = canvas;

    let timer: ReturnType<typeof setTimeout> | null = null;
    const notify = () => {
      if (!loadingRef.current) onDirtyRef.current(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChangeRef.current(), 80);
    };
    const updateSelectionState = () => {
      const active = canvas.getActiveObject();
      setSelectedProps(getObjectProps(active));
    };

    for (const ev of [
      'object:added',
      'object:modified',
      'object:removed',
      'text:changed',
    ] as const) {
      canvas.on(ev, notify);
    }

    canvas.on('selection:created', updateSelectionState);
    canvas.on('selection:updated', updateSelectionState);
    canvas.on('selection:cleared', () => setSelectedProps(null));
    canvas.on('object:modified', updateSelectionState);
    canvas.on('text:changed', updateSelectionState);

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
    canvas.backgroundColor = 'transparent';
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
      // Fabric parses the JSON string and rebuilds every object itself.
      await canvas.loadFromJSON(json);
      canvas.backgroundColor = 'transparent';
      setTimeout(() => {
        canvas.setViewportTransform([1, 0, 0, 1, PADDING * DISPLAY_SCALE, PADDING * DISPLAY_SCALE]);
        canvas.requestRenderAll();
      }, 0);
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

  const updateSelected = useCallback(
    async (props: Partial<SelectedObjectProps>) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const active = canvas.getActiveObject();
      if (!active) return;

      // Handle common positioning and sizing
      if (props.left !== undefined) {
        active.set('left', props.left * DISPLAY_SCALE);
      }
      if (props.top !== undefined) {
        active.set('top', props.top * DISPLAY_SCALE);
      }
      if (props.angle !== undefined) {
        active.set('angle', props.angle);
      }

      // Sizing
      if (props.width !== undefined) {
        if (active.type === 'textbox' || active.type === 'rect') {
          active.set({
            width: props.width * DISPLAY_SCALE,
            scaleX: 1,
          });
        } else {
          // Image / QR / Barcode
          const nativeWidth = active.width ?? 1;
          active.set('scaleX', (props.width * DISPLAY_SCALE) / nativeWidth);
        }
      }
      if (props.height !== undefined) {
        if (active.type === 'rect') {
          active.set({
            height: props.height * DISPLAY_SCALE,
            scaleY: 1,
          });
        } else if (active.type !== 'textbox') {
          // Image / QR / Barcode
          const nativeHeight = active.height ?? 1;
          active.set('scaleY', (props.height * DISPLAY_SCALE) / nativeHeight);
        }
      }

      // Text-specific properties
      if (active.type === 'textbox') {
        const textbox = active as Textbox;
        if (props.text !== undefined) textbox.set('text', props.text);
        if (props.fontFamily !== undefined) textbox.set('fontFamily', props.fontFamily);
        if (props.fontSize !== undefined) textbox.set('fontSize', props.fontSize * DISPLAY_SCALE);
        if (props.fontWeight !== undefined) textbox.set('fontWeight', props.fontWeight);
        if (props.fontStyle !== undefined) textbox.set('fontStyle', props.fontStyle);
        if (props.underline !== undefined) textbox.set('underline', props.underline);
        if (props.linethrough !== undefined) textbox.set('linethrough', props.linethrough);
        if (props.textAlign !== undefined) textbox.set('textAlign', props.textAlign);
      }

      // Rect-specific properties
      if (active.type === 'rect') {
        const rect = active as Rect;
        if (props.fill !== undefined) rect.set('fill', props.fill);
        if (props.stroke !== undefined) rect.set('stroke', props.stroke);
        if (props.strokeWidth !== undefined) rect.set('strokeWidth', props.strokeWidth * DISPLAY_SCALE);
        if (props.rx !== undefined) rect.set({ rx: props.rx * DISPLAY_SCALE, ry: props.rx * DISPLAY_SCALE });
      }

      // QR-specific properties
      if ('qrText' in active && props.qrText !== undefined) {
        const qrText = props.qrText || ' ';
        active.set('qrText', qrText);
        try {
          const url = await QRCode.toDataURL(qrText, { margin: 1, scale: 8 });
          const imgEl = new Image();
          imgEl.src = url;
          await new Promise((resolve) => {
            imgEl.onload = resolve;
          });
          (active as any).setElement(imgEl);
        } catch (err) {
          console.error('Error updating QR code:', err);
        }
      }

      // Barcode-specific properties
      if ('barcodeText' in active && props.barcodeText !== undefined) {
        const barcodeText = props.barcodeText || '0';
        active.set('barcodeText', barcodeText);
        try {
          const { toCanvas } = await import('bwip-js/browser');
          const off = document.createElement('canvas');
          toCanvas(off, {
            bcid: 'code128',
            text: barcodeText,
            scale: 3,
            height: 10,
            includetext: true,
            textxalign: 'center',
          });
          const imgEl = new Image();
          imgEl.src = off.toDataURL('image/png');
          await new Promise((resolve) => {
            imgEl.onload = resolve;
          });
          (active as any).setElement(imgEl);
        } catch (err) {
          console.error('Error updating Barcode:', err);
        }
      }

      canvas.requestRenderAll();
      // Notify parent about changes
      canvas.fire('object:modified', { target: active });
      // Update local state props immediately
      setSelectedProps(getObjectProps(active));
    },
    [],
  );

  return {
    canvasElRef,
    selectedProps,
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
      updateSelected,
    },
  };
}
