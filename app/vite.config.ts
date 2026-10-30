import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  server: { host: '0.0.0.0', port: 3000, allowedHosts: true },
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
  clearScreen: false,
});
