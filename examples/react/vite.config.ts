import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const monorepoRoot = resolve(here, '../..');
const pkgDist = (p: string) => resolve(monorepoRoot, 'packages/biewer/dist', p);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@deepnoid/biewer/react': pkgDist('react.js'),
      '@deepnoid/biewer': pkgDist('index.js'),
    },
  },
  optimizeDeps: {
    exclude: ['@deepnoid/biewer', '@deepnoid/biewer/react'],
  },
  server: {
    port: 5191,
    strictPort: false,
    fs: { allow: [monorepoRoot] },
    watch: { ignored: ['!**/packages/biewer/dist/**'] },
  },
});
