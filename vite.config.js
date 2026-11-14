import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PUBLIC_FILES = ['/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png'];

// Builds dist/sw.js from pwa/sw.js with the exact list of files this build produced,
// so the app can be saved for offline use and each deploy replaces the old cache.
function serviceWorker() {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map') && !f.endsWith('.html'))
        .map((f) => '/' + f);
      const precache = ['/', ...files, ...PUBLIC_FILES];
      const html = Object.values(bundle).find((f) => f.fileName === 'index.html');
      const version = createHash('sha256')
        .update(precache.join('\n') + (html?.source || ''))
        .digest('hex')
        .slice(0, 12);
      const source = readFileSync(new URL('./pwa/sw.js', import.meta.url), 'utf8')
        .replace("'__VERSION__'", JSON.stringify(version))
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
});
