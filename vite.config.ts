/// <reference types="vitest/config" />
import { defineConfig } from 'vite'; import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    // Full-world integration tests (multilateral, elections, constitution) run the whole invariant
    // registry over 252 Countries; on slower CI runners the 5s default is too tight. The timeout
    // only widens the time budget — no assertion or invariant is weakened.
    testTimeout: 30_000,
  },
});
