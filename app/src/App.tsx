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
      </header>

      <main className="app__main">
        <section className="panel panel--editor">
          <DesignBar
            api={api}
            dirty={dirty}
            name={name}
            setName={setName}
            setDirty={setDirty}
          />
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
