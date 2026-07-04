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
      {/* 1. Left Toolbox (Vertical Toolbar) */}
      <div className="editor__toolbox">
        <div className="toolbox__section-title">Tools</div>
        
        <button
          type="button"
          onClick={() => api.addText()}
          className="toolbox__btn"
          title="Add Text (T)"
        >
          <svg viewBox="0 0 24 24" className="toolbox__icon">
            <path d="M4 7V4h16v3M9 20h6M12 4v16" />
          </svg>
          <span className="toolbox__label">Text</span>
        </button>

        <button
          type="button"
          onClick={api.addRect}
          className="toolbox__btn"
          title="Add Box (R)"
        >
          <svg viewBox="0 0 24 24" className="toolbox__icon">
            <rect x="3" y="3" width="18" height="18" rx="2" />
          </svg>
          <span className="toolbox__label">Box</span>
        </button>

        <button
          type="button"
          onClick={onAddQr}
          className="toolbox__btn"
          title="Add QR Code (Q)"
        >
          <svg viewBox="0 0 24 24" className="toolbox__icon">
            <rect x="3" y="3" width="8" height="8" rx="1" />
            <rect x="13" y="3" width="8" height="8" rx="1" />
            <rect x="3" y="13" width="8" height="8" rx="1" />
            <rect x="13" y="13" width="4" height="4" />
            <rect x="17" y="17" width="4" height="4" />
            <rect x="13" y="17" width="2" height="4" />
            <rect x="17" y="13" width="4" height="2" />
          </svg>
          <span className="toolbox__label">QR Code</span>
        </button>

        <button
          type="button"
          onClick={onAddBarcode}
          className="toolbox__btn"
          title="Add Barcode (B)"
        >
          <svg viewBox="0 0 24 24" className="toolbox__icon">
            <rect x="3" y="4" width="2" height="16" />
            <rect x="7" y="4" width="1" height="16" />
            <rect x="10" y="4" width="3" height="16" />
            <rect x="15" y="4" width="1" height="16" />
            <rect x="18" y="4" width="3" height="16" />
          </svg>
          <span className="toolbox__label">Barcode</span>
        </button>

        <label className="toolbox__btn toolbox__file-label" title="Upload Image (I)">
          <svg viewBox="0 0 24 24" className="toolbox__icon">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          <span className="toolbox__label">Image</span>
          <input type="file" accept="image/*" onChange={onAddImage} hidden />
        </label>

        <div className="toolbox__divider" />

        <button
          type="button"
          onClick={api.deleteSelected}
          className="toolbox__btn toolbox__btn--danger"
          disabled={!selectedProps}
          title="Delete Element (Del)"
        >
          <svg viewBox="0 0 24 24" className="toolbox__icon">
            <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6" />
          </svg>
          <span className="toolbox__label">Delete</span>
        </button>
      </div>

      {/* 2. Center Canvas Viewport */}
      <div className="editor__stage">
        <div className="editor__canvas-viewport">
          <div className="editor__canvas-wrap">
            <canvas ref={canvasElRef} />
          </div>
        </div>
      </div>

      {/* 3. Right Sidebar Inspector (Properties + Print Preview) */}
      <div className="editor__inspector">
        {/* Properties Section */}
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
              <svg className="properties__empty-icon" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="4 4" />
                <path d="M9 12h6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M12 9v6" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <p>Select an element on the canvas to customize its settings</p>
            </div>
          )}
        </div>

        {/* Live Print Preview Section */}
        <div className="editor__preview-panel">
          <div className="preview-panel__header">
            <h3>Print Preview</h3>
            <span className="preview-panel__size">
              {spec.printWidthDots}×{spec.printHeightDots} dots
            </span>
          </div>
          
          <div className="preview-panel__content">
            <PrintPreview source={preview} spec={spec} enhance={enhance} />
          </div>

          <div className="preview-panel__footer">
            <label className="preview-panel__toggle">
              <input
                type="checkbox"
                checked={enhance}
                onChange={(e) => onEnhanceChange(e.target.checked)}
              />
              <span className="toggle__text">Dither Enhancement</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
