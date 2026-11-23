import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const shared = fileURLToPath(new URL('../shared', import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@shared': shared },
  },
  build: {
    manifest: true, // used by scripts/check-bundle.mjs
    rollupOptions: {
      output: {
        // Keep big libraries in their own cacheable chunks (review 10).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[\\/](recharts|d3-[^\\/]+|victory-vendor|decimal\.js-light|internmap|@reduxjs|redux|immer|reselect|es-toolkit|eventemitter3|tiny-invariant)[\\/]/.test(id)) return 'charts'
          if (/[\\/](react|react-dom|scheduler|react-router|react-router-dom|cookie|set-cookie-parser)[\\/]/.test(id)) return 'react'
          if (/[\\/](socket\.io-client|engine\.io-client|engine\.io-parser|socket\.io-parser|@socket\.io|xmlhttprequest-ssl|ws)[\\/]/.test(id)) return 'realtime'
          return undefined
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
      '/socket.io': { target: 'http://localhost:5000', ws: true },
    },
    // Allow importing the shared contracts that live outside this folder.
    fs: { allow: ['..'] },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
  },
})
