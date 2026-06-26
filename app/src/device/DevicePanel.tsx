import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  paperColorLabel,
  paperTypeLabel,
  readinessLabel,
  TimeoutSetting,
  type BatteryData,
  type DeviceConfig,
  type LabelSpec,
  type PrinterStatus,
} from '../core';
import {
  detectWebTransport,
  getWebTransportMethod,
  isElectron,
  setWebTransportMethod,
  type WebTransportMethod,
} from '../transport';
import { printer } from './printerService';
import './device.css';

interface DevicePanelProps {
  getImageData: () => ImageData | null;
  spec: LabelSpec;
  enhance: boolean;
}

function minutesToSetting(min: number): TimeoutSetting {
  switch (min) {
    case 15:
      return TimeoutSetting.MINUTES_15;
    case 30:
      return TimeoutSetting.MINUTES_30;
    case 60:
      return TimeoutSetting.MINUTES_60;
    default:
      return TimeoutSetting.NEVER;
  }
}

function settingToMinutes(setting: TimeoutSetting): number {
  switch (setting) {
    case TimeoutSetting.MINUTES_15:
      return 15;
    case TimeoutSetting.MINUTES_30:
      return 30;
    case TimeoutSetting.MINUTES_60:
      return 60;
    default:
      return 0;
  }
}

export function DevicePanel({ getImageData, spec, enhance }: DevicePanelProps) {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [status, setStatus] = useState<PrinterStatus | null>(null);
  const [battery, setBattery] = useState<BatteryData | null>(null);
  const [config, setConfig] = useState<DeviceConfig | null>(null);
  const [density, setDensity] = useState(15);
  const [copies, setCopies] = useState(1);
  const [method, setMethod] = useState<WebTransportMethod>(getWebTransportMethod());

  const isWeb = !isElectron() && Capacitor.getPlatform() === 'web';

  // On web, auto-pick the connection: if the page is served by the print-server
  // it has a built-in Bluetooth pipe; otherwise fall back to Web Serial.
  useEffect(() => {
    if (!isWeb) return;
    let alive = true;
    void detectWebTransport().then((m) => {
      if (alive) setMethod(m);
    });
    return () => {
      alive = false;
    };
  }, [isWeb]);

  const run = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setBusy(label);
      setError(null);
      setNote(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const connect = () =>
    run('Connecting', async () => {
      const devices = await printer.listDevices();
      if (devices.length === 0) throw new Error('No paired devices found');
      const target =
        devices.find((d) => (d.name ?? '').toUpperCase().includes('P21')) ??
        devices[0];
      await printer.connect(target);
      setConnected(true);
      setNote(`Connected to ${target.name ?? target.id}`);
      setStatus(await printer.getStatus());
      setBattery(await printer.getBattery());
      setConfig(await printer.getConfig());
    });

  const disconnect = () =>
    run('Disconnecting', async () => {
      await printer.disconnect();
      setConnected(false);
      setStatus(null);
      setBattery(null);
      setConfig(null);
    });

  const refresh = () =>
    run('Refreshing', async () => {
      setStatus(await printer.getStatus());
      setBattery(await printer.getBattery());
      setConfig(await printer.getConfig());
    });

  const print = () =>
    run('Printing', async () => {
      const image = getImageData();
      if (!image) throw new Error('Nothing to print');
      const result = await printer.print(image, spec, density, copies, {
        enhance,
      });
      if (result) {
        setStatus(result);
        setNote('Print sent');
      }
    });

  const selfTest = () => run('Self-test', () => printer.selfTest());

  const changeTimeout = (min: number) =>
    run('Saving timeout', async () => {
      await printer.setTimeout(minutesToSetting(min));
      setConfig(await printer.getConfig());
    });

  const changeBeep = (on: boolean) =>
    run('Saving beep', async () => {
      await printer.setBeep(on);
      setConfig(await printer.getConfig());
    });

  const changeMethod = (next: WebTransportMethod) => {
    setWebTransportMethod(next);
    setMethod(next);
    setError(null);
    setNote(null);
  };

  const disabled = busy !== null;

  return (
    <div className="device">
      <div className="device__head">
        <h2>Device</h2>
        <span className={`device__dot ${connected ? 'is-on' : ''}`} />
      </div>
      <p className="device__transport">{printer.transportName}</p>

      {isWeb && !connected && (
        <label className="device__method">
          Connection
          <select
            value={method}
            disabled={disabled}
            onChange={(e) => changeMethod(e.target.value as WebTransportMethod)}
          >
            <option value="bridge">Server Bluetooth</option>
            <option value="serial">Web Serial (this browser)</option>
          </select>
        </label>
      )}

      {!connected ? (
        <button type="button" onClick={connect} disabled={disabled}>
          {busy === 'Connecting' ? 'Connecting…' : 'Connect'}
        </button>
      ) : (
        <div className="device__row">
          <button type="button" onClick={refresh} disabled={disabled}>
            Refresh
          </button>
          <button type="button" onClick={disconnect} disabled={disabled}>
            Disconnect
          </button>
        </div>
      )}

      {note && <p className="device__note">{note}</p>}
      {error && <p className="device__error">{error}</p>}

      {status && (
        <dl className="device__info">
          <dt>Status</dt>
          <dd>{readinessLabel(status.readiness)}</dd>
          {status.noRfidTag ? (
            <>
              <dt>Label</dt>
              <dd>No RFID tag detected</dd>
            </>
          ) : (
            <>
              <dt>Label</dt>
              <dd>
                {status.labelWidthMm}×{status.labelLengthMm} mm ·{' '}
                {paperTypeLabel(status.paperType)} ·{' '}
                {paperColorLabel(status.labelColor)}
              </dd>
            </>
          )}
          {battery && (
            <>
              <dt>Battery</dt>
              <dd>
                {battery.level}% {battery.charging ? '(charging)' : ''}
              </dd>
            </>
          )}
        </dl>
      )}

      <div className="device__section">
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
          <label>
            Copies
            <input
              type="number"
              min={1}
              value={copies}
              onChange={(e) => setCopies(Number(e.target.value))}
            />
          </label>
        </div>
        <button
          type="button"
          className="device__print-btn"
          onClick={print}
          disabled={disabled || !connected}
        >
          {busy === 'Printing' ? 'Printing…' : 'Print'}
        </button>
      </div>

      <details className="device__settings">
        <summary>Settings</summary>
        <label className="device__setting">
          Auto-off
          <select
            value={config ? settingToMinutes(config.timeout) : 0}
            disabled={disabled || !connected}
            onChange={(e) => changeTimeout(Number(e.target.value))}
          >
            <option value={0}>Never</option>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={60}>60 min</option>
          </select>
        </label>
        <label className="device__setting">
          Beep
          <input
            type="checkbox"
            checked={config ? config.beep === 1 : false}
            disabled={disabled || !connected}
            onChange={(e) => changeBeep(e.target.checked)}
          />
        </label>
        <button
          type="button"
          onClick={selfTest}
          disabled={disabled || !connected}
        >
          Self-test print
        </button>
      </details>
    </div>
  );
}
