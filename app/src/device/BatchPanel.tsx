import { useRef, useState } from 'react';
import { type LabelSpec } from '../core';
import { createRowRenderer, parseCsv, type RowRenderer } from '../editor/mailmerge';
import { printer } from './printerService';
import './device.css';

interface BatchPanelProps {
  getDesignJSON: () => string;
  spec: LabelSpec;
  enhance: boolean;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function downloadDataUrl(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function BatchPanel({ getDesignJSON, spec, enhance }: BatchPanelProps) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [density, setDensity] = useState(15);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ i: number; n: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const stop = useRef(false);

  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setNote(null);
    parseCsv(file)
      .then(({ headers, rows }) => {
        setHeaders(headers);
        setRows(rows);
        setFileName(file.name);
      })
      .catch((err) => setError(`CSV error: ${err?.message ?? err}`));
  };

  const runOverRows = async (
    label: string,
    each: (renderer: RowRenderer, row: Record<string, string>, i: number) => Promise<void>,
  ) => {
    if (rows.length === 0) return;
    setBusy(true);
    setError(null);
    setNote(null);
    stop.current = false;
    let renderer: RowRenderer | undefined;
    try {
      renderer = await createRowRenderer(getDesignJSON(), spec);
      let i = 0;
      for (; i < rows.length; i++) {
        if (stop.current) break;
        setProgress({ i: i + 1, n: rows.length });
        await each(renderer, rows[i], i);
      }
      setNote(stop.current ? `Stopped after ${i} of ${rows.length}.` : `${label} ${rows.length} labels.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      renderer?.dispose();
      setBusy(false);
      setProgress(null);
    }
  };

  const printAll = () => {
    if (!printer.isConnected()) {
      setError('Connect the printer first (Device panel).');
      return;
    }
    void runOverRows('Printed', async (renderer, row) => {
      const img = await renderer.render(row);
      if (!img) throw new Error('Render failed');
      await printer.print(img, spec, density, 1, { enhance });
      await delay(250); // small gap so the printer keeps up
    });
  };

  const exportPngs = () =>
    void runOverRows('Exported', async (renderer, row, i) => {
      const url = await renderer.toDataUrl(row);
      downloadDataUrl(url, `label-${String(i + 1).padStart(3, '0')}.png`);
      await delay(120); // let the browser process sequential downloads
    });

  const tokenHint = `{{${headers[0] ?? 'column'}}}`;

  return (
    <div className="device">
      <div className="device__head">
        <h2>Batch</h2>
      </div>

      <label className="designbar__import batch__import">
        Import CSV…
        <input type="file" accept=".csv,text/csv" hidden onChange={onImport} />
      </label>

      {rows.length > 0 && (
        <>
          <p className="device__transport">
            {rows.length} rows · {fileName}
          </p>
          <p className="batch__columns">columns: {headers.join(', ')}</p>
          <p className="batch__hint">
            Put <code>{tokenHint}</code> in a text box to merge a column.
          </p>

          <div className="device__print">
            <label>
              Density
              <input
                type="number"
                min={1}
                max={15}
                value={density}
                onChange={(e) => setDensity(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="device__row">
            <button type="button" className="device__print-btn" onClick={printAll} disabled={busy}>
              {busy ? 'Working…' : `Print all (${rows.length})`}
            </button>
            <button type="button" onClick={exportPngs} disabled={busy}>
              Export PNGs
            </button>
            {busy && (
              <button type="button" onClick={() => (stop.current = true)}>
                Stop
              </button>
            )}
          </div>
        </>
      )}

      {progress && (
        <p className="device__note">
          {progress.i} / {progress.n}…
        </p>
      )}
      {note && <p className="device__note">{note}</p>}
      {error && <p className="device__error">{error}</p>}
    </div>
  );
}
