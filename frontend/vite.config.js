import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const root = import.meta.dirname;
const api = process.env.API_PROXY_TARGET || 'http://127.0.0.1:8000';

export default defineConfig({
  root: resolve(root, 'public'),
  publicDir: false,
  server: { port: 5173, strictPort: true, proxy: { '/api': api } },
  preview: { port: 4173, strictPort: true, proxy: { '/api': api } },
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    manifest: true,
    sourcemap: false,
    rollupOptions: {
      input: {
        portal: resolve(root, 'public/index.html'),
        team: resolve(root, 'public/back-office/index.html'),
        client: resolve(root, 'public/front-office/index.html'),
      },
    },
  },
  plugins: [{
    name: 'epicea-runtime-assets',
    generateBundle() {
      for (const name of ['manifest.webmanifest', 'service-worker.js']) {
        this.emitFile({ type: 'asset', fileName: name, source: readFileSync(resolve(root, 'public', name)) });
      }
    },
  }],
});
