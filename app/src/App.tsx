import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_LABEL } from './core';
import { BatchPanel } from './device/BatchPanel';
import { DevicePanel } from './device/DevicePanel';
import { DesignBar } from './editor/DesignBar';
import { Editor } from './editor/Editor';
import { useLabelEditor } from './editor/useLabelEditor';
import './App.css';

function App() {
  const [spec] = useState(DEFAULT_LABEL);
  const [enhance, setEnhance] = useState(true);
  const [preview, setPreview] = useState<ImageData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const getImageDataRef = useRef<() => ImageData | null>(() => null);
  const handleChange = useCallback(() => {
    setPreview(getImageDataRef.current());
  }, []);

  const { canvasElRef, selectedProps, api } = useLabelEditor(spec, handleChange, setDirty);
  getImageDataRef.current = api.getImageData;

  // Warn before leaving/refreshing with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return (
    <div className="app">
      <header className="app__header">
        <h1>Nelko P21</h1>
        <DesignBar
          api={api}
          dirty={dirty}
          name={name}
          setName={setName}
          setDirty={setDirty}
        />
        <button
          type="button"
          className="theme-toggle"
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
        </button>
      </header>

      <main className="app__main">
        <section className="panel panel--editor">
          <Editor
            canvasElRef={canvasElRef}
            api={api}
            spec={spec}
            enhance={enhance}
            onEnhanceChange={setEnhance}
            preview={preview}
            selectedProps={selectedProps}
          />
        </section>

        <aside className="panel panel--side">
          <DevicePanel
            getImageData={api.getImageData}
            spec={spec}
            enhance={enhance}
          />
          <BatchPanel
            getDesignJSON={api.toJSON}
            spec={spec}
            enhance={enhance}
          />
        </aside>
      </main>
    </div>
  );
}

export default App;
