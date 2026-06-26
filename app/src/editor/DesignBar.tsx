import { useEffect, useState } from 'react';
import type { LabelEditorApi } from './useLabelEditor';
import {
  deleteDesign,
  downloadDesign,
  listDesigns,
  loadDesign,
  saveDesign,
} from './designStore';
import './editor.css';

interface DesignBarProps {
  api: LabelEditorApi;
  dirty: boolean;
  name: string;
  setName: (name: string) => void;
  setDirty: (dirty: boolean) => void;
}

export function DesignBar({ api, dirty, name, setName, setDirty }: DesignBarProps) {
  const [saved, setSaved] = useState<string[]>([]);
  useEffect(() => setSaved(listDesigns()), []);
  const refresh = () => setSaved(listDesigns());

  const okToDiscard = (action: string) =>
    !dirty || window.confirm(`Discard unsaved changes and ${action}?`);

  const save = (asNew: boolean) => {
    let target = name;
    if (asNew || !target) {
      const input = window.prompt('Save design as:', target || 'label');
      if (input == null) return;
      target = input.trim();
      if (!target) return;
    }
    if (
      target !== name &&
      saved.includes(target) &&
      !window.confirm(`Overwrite “${target}”?`)
    ) {
      return;
    }
    saveDesign(target, api.toJSON());
    setName(target);
    setDirty(false);
    refresh();
  };

  const open = (target: string) => {
    if (!target || !okToDiscard(`open “${target}”`)) return;
    const json = loadDesign(target);
    if (json == null) return;
    void api.loadJSON(json).then(() => {
      setName(target);
      setDirty(false);
    });
  };

  const newDoc = () => {
    if (!okToDiscard('start a new design')) return;
    api.clear();
    setName('');
    setDirty(false);
  };

  const remove = () => {
    if (!name || !saved.includes(name)) return;
    if (!window.confirm(`Delete saved design “${name}”?`)) return;
    deleteDesign(name);
    setName('');
    refresh();
  };

  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !okToDiscard(`import “${file.name}”`)) return;
    file
      .text()
      .then((json) => api.loadJSON(json))
      .then(() => {
        setName(file.name.replace(/\.(nelko\.)?json$/i, ''));
        setDirty(false);
      })
      .catch((err) => window.alert(`Import failed: ${err?.message ?? err}`));
  };

  return (
    <div className="designbar">
      <button type="button" onClick={newDoc}>
        New
      </button>
      <select
        className="designbar__open"
        value=""
        onChange={(e) => open(e.target.value)}
      >
        <option value="">Open…</option>
        {saved.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <span className="designbar__name">
        <input
          value={name}
          placeholder="Untitled"
          aria-label="Design name"
          onChange={(e) => setName(e.target.value)}
        />
        {dirty && (
          <span className="designbar__dirty" title="Unsaved changes">
            ●
          </span>
        )}
      </span>
      <button type="button" onClick={() => save(false)}>
        Save
      </button>
      <button type="button" onClick={() => save(true)}>
        Save As
      </button>
      <span className="editor__spacer" />
      <button type="button" onClick={() => downloadDesign(name, api.toJSON())}>
        Export
      </button>
      <label className="designbar__import">
        Import
        <input
          type="file"
          accept=".json,application/json"
          hidden
          onChange={onImport}
        />
      </label>
      {name && saved.includes(name) && (
        <button type="button" className="designbar__delete" onClick={remove}>
          Delete
        </button>
      )}
    </div>
  );
}
