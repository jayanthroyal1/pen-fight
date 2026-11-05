import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';

export default defineConfig({
  base: './',
  plugins: [react(), wasm()],
  // Rapier's WASM loader uses top-level await, which ES2022 browsers run natively.
  build: { target: 'es2022' },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d'],
  },
  test: {
    environment: 'node',
    // Several test files load the physics engine's 3 MB of WASM at once.
    hookTimeout: 60_000,
    // The package only declares a browser `module` entry, which Vitest's resolver skips.
    alias: {
      '@dimforge/rapier3d': fileURLToPath(new URL('./node_modules/@dimforge/rapier3d/rapier.js', import.meta.url)),
    },
    server: {
      deps: { inline: ['@dimforge/rapier3d'] },
    },
  },
});
