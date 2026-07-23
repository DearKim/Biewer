import { defineConfig } from 'tsup';
import { writeFileSync } from 'node:fs';

// Multi-entry build: framework-agnostic core + React adapter + Web Component adapter.
// Each entry ships ESM + CJS + d.ts. React stays external (optional peer).
export default defineConfig({
  entry: {
    index: 'src/core/index.ts',
    react: 'src/react/index.ts',
    wc: 'src/wc/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: 'es2020',
  external: ['react', 'react-dom', 'react/jsx-runtime'],
  // Emit the standalone stylesheet for consumers who opt out of runtime injection
  // (injectStyles: false). The same CSS string is inlined into the core for injection.
  async onSuccess() {
    const { BIEWER_CSS } = await import('./src/core/styles.ts');
    writeFileSync('dist/style.css', BIEWER_CSS, 'utf8');
  },
});
