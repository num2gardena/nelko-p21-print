import { type RefObject, useState, useEffect } from 'react';
import { type LabelSpec } from '../core';
import { PrintPreview } from './PrintPreview';
import { type LabelEditorApi, type SelectedObjectProps } from './useLabelEditor';
import './editor.css';

interface EditorProps {
  canvasElRef: RefObject<HTMLCanvasElement | null>;
  api: LabelEditorApi;
  spec: LabelSpec;
  enhance: boolean;
  onEnhanceChange: (value: boolean) => void;
  preview: ImageData | null;
  selectedProps: SelectedObjectProps | null;
}

function NumberInput({
  label,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (val: number) => void;
  disabled?: boolean;
}) {
  const [localVal, setLocalVal] = useState(String(value));

  useEffect(() => {
    setLocalVal(String(value));
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const s = e.target.value;
    setLocalVal(s);
    if (s === '') return;
    const n = parseFloat(s);
    if (!isNaN(n)) {
      onChange(n);
    }
  };

  return (
    <div className="properties__field">
      <label className="properties__label">{label}</label>
      <input
        type="number"
        className="properties__input"
        value={localVal}
        min={min}
        max={max}
        onChange={handleChange}
        disabled={disabled}
      />
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  multiline?: boolean;
}) {
  const [localVal, setLocalVal] = useState(value);

  useEffect(() => {
    setLocalVal(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const s = e.target.value;
    setLocalVal(s);
    onChange(s);
  };

  return (
    <div className="properties__field">
      <label className="properties__label">{label}</label>
      {multiline ? (
        <textarea
          className="properties__textarea"
          value={localVal}
          onChange={handleChange}
          rows={3}
        />
      ) : (
        <input
          type="text"
          className="properties__input"
          value={localVal}
          onChange={handleChange}
        />
      )}
    </div>
  );
}

export function Editor({
  canvasElRef,
  api,
  spec,
  enhance,
  onEnhanceChange,
  preview,
  selectedProps,
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

        {/* Element Property Editor */}
        <div className="editor__properties">
          <div className="properties__header">
            <h2>Properties</h2>
            {selectedProps && (
              <span className={`properties__badge properties__badge--${selectedProps.type}`}>
                {selectedProps.type}
              </span>
            )}
          </div>

          {selectedProps ? (
            <div className="properties__scrollable">
              {/* Contextual Properties */}
              {selectedProps.type === 'textbox' && (
                <div className="properties__section">
                  <h3>Text Settings</h3>
                  <TextInput
                    label="Text Content"
                    value={selectedProps.text ?? ''}
                    multiline
                    onChange={(val) => api.updateSelected({ text: val })}
                  />

                  <div className="properties__field">
                    <label className="properties__label">Font Family</label>
                    <select
                      className="properties__select"
                      value={selectedProps.fontFamily}
                      onChange={(e) => api.updateSelected({ fontFamily: e.target.value })}
                    >
                      <option value="sans-serif">Sans-serif</option>
                      <option value="serif">Serif</option>
                      <option value="monospace">Monospace</option>
                      <option value="Arial">Arial</option>
                      <option value="Georgia">Georgia</option>
                      <option value="Courier New">Courier New</option>
                      <option value="Impact">Impact</option>
                    </select>
                  </div>

                  <div className="properties__row">
                    <NumberInput
                      label="Font Size (dots)"
                      value={selectedProps.fontSize ?? 12}
                      min={4}
                      max={120}
                      onChange={(val) => api.updateSelected({ fontSize: val })}
                    />
                  </div>

                  <div className="properties__field">
                    <label className="properties__label">Text Style</label>
                    <div className="properties__btn-group">
                      <button
                        type="button"
                        className={`properties__toggle-btn ${selectedProps.fontWeight === 'bold' ? 'properties__toggle-btn--active' : ''}`}
                        onClick={() => api.updateSelected({ fontWeight: selectedProps.fontWeight === 'bold' ? 'normal' : 'bold' })}
                        title="Bold"
                        style={{ fontWeight: 'bold' }}
                      >
                        B
                      </button>
                      <button
                        type="button"
                        className={`properties__toggle-btn ${selectedProps.fontStyle === 'italic' ? 'properties__toggle-btn--active' : ''}`}
                        onClick={() => api.updateSelected({ fontStyle: selectedProps.fontStyle === 'italic' ? 'normal' : 'italic' })}
                        title="Italic"
                        style={{ fontStyle: 'italic' }}
                      >
                        I
                      </button>
                      <button
                        type="button"
                        className={`properties__toggle-btn ${selectedProps.underline ? 'properties__toggle-btn--active' : ''}`}
                        onClick={() => api.updateSelected({ underline: !selectedProps.underline })}
                        title="Underline"
                        style={{ textDecoration: 'underline' }}
                      >
                        U
                      </button>
                      <button
                        type="button"
                        className={`properties__toggle-btn ${selectedProps.linethrough ? 'properties__toggle-btn--active' : ''}`}
                        onClick={() => api.updateSelected({ linethrough: !selectedProps.linethrough })}
                        title="Strikethrough"
                        style={{ textDecoration: 'line-through' }}
                      >
                        S
                      </button>
                    </div>
                  </div>

                  <div className="properties__field">
                    <label className="properties__label">Alignment</label>
                    <div className="properties__btn-group">
                      <button
                        type="button"
                        className={`properties__toggle-btn ${selectedProps.textAlign === 'left' ? 'properties__toggle-btn--active' : ''}`}
                        onClick={() => api.updateSelected({ textAlign: 'left' })}
                        title="Align Left"
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="3" y1="6" x2="21" y2="6" />
                          <line x1="3" y1="12" x2="15" y2="12" />
                          <line x1="3" y1="18" x2="19" y2="18" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={`properties__toggle-btn ${selectedProps.textAlign === 'center' ? 'properties__toggle-btn--active' : ''}`}
                        onClick={() => api.updateSelected({ textAlign: 'center' })}
                        title="Align Center"
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="3" y1="6" x2="21" y2="6" />
                          <line x1="6" y1="12" x2="18" y2="12" />
                          <line x1="4" y1="18" x2="20" y2="18" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={`properties__toggle-btn ${selectedProps.textAlign === 'right' ? 'properties__toggle-btn--active' : ''}`}
                        onClick={() => api.updateSelected({ textAlign: 'right' })}
                        title="Align Right"
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="3" y1="6" x2="21" y2="6" />
                          <line x1="9" y1="12" x2="21" y2="12" />
                          <line x1="5" y1="18" x2="21" y2="18" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        className={`properties__toggle-btn ${selectedProps.textAlign === 'justify' ? 'properties__toggle-btn--active' : ''}`}
                        onClick={() => api.updateSelected({ textAlign: 'justify' })}
                        title="Justify"
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <line x1="3" y1="6" x2="21" y2="6" />
                          <line x1="3" y1="12" x2="21" y2="12" />
                          <line x1="3" y1="18" x2="21" y2="18" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {selectedProps.type === 'rect' && (
                <div className="properties__section">
                  <h3>Border & Fill</h3>
                  
                  <div className="properties__field">
                    <label className="properties__label">Fill Color</label>
                    <select
                      className="properties__select"
                      value={selectedProps.fill}
                      onChange={(e) => api.updateSelected({ fill: e.target.value })}
                    >
                      <option value="transparent">Transparent / None</option>
                      <option value="#000000">Solid Black</option>
                      <option value="#ffffff">Solid White</option>
                    </select>
                  </div>

                  <div className="properties__field">
                    <label className="properties__label">Border Color</label>
                    <select
                      className="properties__select"
                      value={selectedProps.stroke}
                      onChange={(e) => api.updateSelected({ stroke: e.target.value })}
                    >
                      <option value="transparent">None</option>
                      <option value="#000000">Black</option>
                    </select>
                  </div>

                  <div className="properties__row">
                    <NumberInput
                      label="Border Width"
                      value={selectedProps.strokeWidth ?? 1}
                      min={0}
                      max={20}
                      onChange={(val) => api.updateSelected({ strokeWidth: val })}
                    />
                    <NumberInput
                      label="Corner Radius"
                      value={selectedProps.rx ?? 0}
                      min={0}
                      max={50}
                      onChange={(val) => api.updateSelected({ rx: val })}
                    />
                  </div>
                </div>
              )}

              {selectedProps.type === 'qr' && (
                <div className="properties__section">
                  <h3>QR Code Settings</h3>
                  <TextInput
                    label="QR Content / URL"
                    value={selectedProps.qrText ?? ''}
                    onChange={(val) => api.updateSelected({ qrText: val })}
                  />
                </div>
              )}

              {selectedProps.type === 'barcode' && (
                <div className="properties__section">
                  <h3>Barcode Settings</h3>
                  <TextInput
                    label="Barcode Value"
                    value={selectedProps.barcodeText ?? ''}
                    onChange={(val) => api.updateSelected({ barcodeText: val })}
                  />
                  <small className="properties__hint">Format: Code 128</small>
                </div>
              )}

              <div className="properties__section-divider" />

              {/* Geometry Properties */}
              <div className="properties__section">
                <h3>Geometry (dots)</h3>
                <div className="properties__grid">
                  <NumberInput
                    label="X (Left)"
                    value={selectedProps.left}
                    onChange={(val) => api.updateSelected({ left: val })}
                  />
                  <NumberInput
                    label="Y (Top)"
                    value={selectedProps.top}
                    onChange={(val) => api.updateSelected({ top: val })}
                  />
                  <NumberInput
                    label="Width"
                    value={selectedProps.width}
                    onChange={(val) => api.updateSelected({ width: val })}
                  />
                  <NumberInput
                    label="Height"
                    value={selectedProps.height}
                    onChange={(val) => api.updateSelected({ height: val })}
                    disabled={selectedProps.type === 'textbox'}
                  />
                </div>

                <div className="properties__row-angle">
                  <NumberInput
                    label="Angle (°)"
                    value={selectedProps.angle}
                    min={0}
                    max={360}
                    onChange={(val) => api.updateSelected({ angle: val })}
                  />
                  <input
                    type="range"
                    className="properties__range"
                    min="0"
                    max="360"
                    value={selectedProps.angle}
                    onChange={(e) => api.updateSelected({ angle: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="properties__empty">
              <svg className="properties__empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="4 4" />
                <path d="M9 12h6" />
                <path d="M12 9v6" />
              </svg>
              <p>Select an element on the canvas to customize its settings</p>
            </div>
          )}
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
