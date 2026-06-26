import type { RefObject } from 'react';
import { type LabelSpec } from '../core';
import { PrintPreview } from './PrintPreview';
import type { LabelEditorApi } from './useLabelEditor';
import './editor.css';

interface EditorProps {
  canvasElRef: RefObject<HTMLCanvasElement | null>;
  api: LabelEditorApi;
  spec: LabelSpec;
  enhance: boolean;
  onEnhanceChange: (value: boolean) => void;
  preview: ImageData | null;
}

export function Editor({
  canvasElRef,
  api,
  spec,
  enhance,
  onEnhanceChange,
  preview,
}: EditorProps) {
  const onAddQr = () => {
    const text = window.prompt('QR code content', 'https://');
    if (text != null) void api.addQr(text);
  };
  const onAddBarcode = () => {
    const text = window.prompt('Barcode value (Code 128)', '12345');
    if (text != null) void api.addBarcode(text);
  };
  const onAddImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void api.addImageFromFile(file);
    e.target.value = '';
  };

  return (
    <div className="editor">
      <div className="editor__toolbar">
        <button type="button" onClick={() => api.addText()}>
          Text
        </button>
        <button type="button" onClick={api.addRect}>
          Box
        </button>
        <button type="button" onClick={onAddQr}>
          QR
        </button>
        <button type="button" onClick={onAddBarcode}>
          Barcode
        </button>
        <label className="editor__file">
          Image
          <input type="file" accept="image/*" onChange={onAddImage} hidden />
        </label>
        <button type="button" onClick={api.deleteSelected}>
          Delete
        </button>
        <span className="editor__spacer" />
        <label className="editor__toggle">
          <input
            type="checkbox"
            checked={enhance}
            onChange={(e) => onEnhanceChange(e.target.checked)}
          />
          Enhance
        </label>
      </div>

      <div className="editor__stage">
        <div className="editor__canvas-wrap">
          <canvas ref={canvasElRef} />
        </div>

        <div className="editor__preview">
          <div className="editor__preview-label">
            Print preview · {spec.printWidthDots}×{spec.printHeightDots} dots
          </div>
          <PrintPreview source={preview} spec={spec} enhance={enhance} />
        </div>
      </div>
    </div>
  );
}
