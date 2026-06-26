/**
 * Design persistence: named slots in localStorage plus file import/export.
 * A "design" is the Fabric canvas serialised with `canvas.toJSON()` (images are
 * embedded as data URLs, so each design is self-contained).
 */
const KEY = 'nelko.designs';

type Store = Record<string, string>;

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function listDesigns(): string[] {
  return Object.keys(readStore()).sort((a, b) => a.localeCompare(b));
}

export function saveDesign(name: string, json: string): void {
  const store = readStore();
  store[name] = json;
  writeStore(store);
}

export function loadDesign(name: string): string | null {
  const store = readStore();
  return name in store ? store[name] : null;
}

export function deleteDesign(name: string): void {
  const store = readStore();
  delete store[name];
  writeStore(store);
}

/** Trigger a download of the design as a `.nelko.json` file. */
export function downloadDesign(name: string, json: string): void {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name || 'label'}.nelko.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
