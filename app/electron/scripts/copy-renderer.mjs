// Copies the built web renderer (app/dist) into electron/renderer so
// electron-builder can package it. Run after the app's `npm run build`.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', 'dist'); // app/dist
const dest = join(here, '..', 'renderer'); // electron/renderer

if (!existsSync(src)) {
  console.error(
    `Renderer build not found at ${src}.\nRun "npm run build" in app/ first.`,
  );
  process.exit(1);
}

rmSync(dest, { recursive: true, force: true });
cpSync(src, dest, { recursive: true });
console.log(`Copied renderer: ${src} -> ${dest}`);
