import { defineConfig } from 'vitest/config';

// Unit tests for pure-TS modules only (no React Native runtime).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
