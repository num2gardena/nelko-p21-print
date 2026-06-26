import { useEffect, useRef } from 'react';
import { monoToImageData, previewMono, type LabelSpec } from '../core';

const PREVIEW_SCALE = 2;

/**
 * Renders the exact 1-bit dithered output the printer will produce, from the
 * editor's rasterised ImageData. Scaled up with nearest-neighbour so individual
 * dots are visible.
 */
export function PrintPreview({
  source,
  spec,
  enhance,
}: {
  source: ImageData | null;
  spec: LabelSpec;
  enhance: boolean;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !source) return;

    const mono = previewMono(source.data, source.width, source.height, spec, {
      enhance,
    });

    const off = document.createElement('canvas');
    off.width = mono.width;
    off.height = mono.height;
    off.getContext('2d')?.putImageData(monoToImageData(mono), 0, 0);

    canvas.width = mono.width * PREVIEW_SCALE;
    canvas.height = mono.height * PREVIEW_SCALE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }, [source, spec, enhance]);

  return <canvas ref={ref} className="preview-canvas" />;
}
