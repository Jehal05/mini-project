import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The API and the app share one origin in development, so the httpOnly refresh cookie just works.
    proxy: { '/api': { target: process.env.VITE_API_PROXY || 'http://localhost:5000', changeOrigin: false } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: false,
    css: false,
  },
});
