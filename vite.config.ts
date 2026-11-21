import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { tsconfigPaths: true },
  appType: 'mpa',
  test: {
    // Let jsdom provide per-window storage instead of Node's file-backed implementation.
    execArgv: ['--no-webstorage'],
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
