import { defineConfig } from 'vite';

// Vite serves web/ and proxies the local science API, so the browser uses one origin.
const api = { '/api': 'http://127.0.0.1:8000' };
export default defineConfig({
  root: 'web',
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: api },
  preview: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: api },
  build: { outDir: '../dist', emptyOutDir: true, chunkSizeWarningLimit: 800 },
});
