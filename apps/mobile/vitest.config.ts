import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit tests for pure-TS modules only (no React Native runtime).
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
