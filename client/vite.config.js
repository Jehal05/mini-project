// Vite config: React plugin, dev server on port 5173 (the origin the API allows via CORS).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
