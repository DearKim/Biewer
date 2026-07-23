import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(here, '../..');
const pkgDist = (p: string) => resolve(monorepoRoot, 'packages/biewer/dist', p);

// The example consumes the BUILT package (packages/biewer/dist) exactly like a
// real npm consumer. Aliases point straight at dist so a `tsup --watch` rebuild
// triggers Vite HMR without re-bundling or restarting the dev server.
export default defineConfig({
  resolve: {
    alias: {
      '@deepnoid/biewer/wc': pkgDist('wc.js'),
      '@deepnoid/biewer': pkgDist('index.js'),
    },
  },
  optimizeDeps: {
    // don't pre-bundle the workspace package — keep dist live-watched
    exclude: ['@deepnoid/biewer'],
  },
  server: {
    port: 5190,
    strictPort: false,
    fs: { allow: [monorepoRoot] },
    watch: {
      // pick up dist rebuilds from `tsup --watch`
      ignored: ['!**/packages/biewer/dist/**'],
    },
  },
});
