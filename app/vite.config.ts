import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the built renderer also loads over file:// inside Electron
  // and from the Android WebView, not just from a web server root.
  base: './',
  plugins: [react()],
})
