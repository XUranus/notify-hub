import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Prevent ECONNRESET from crashing the dev server (SSE/WS proxy disconnections)
process.on('uncaughtException', (err) => {
  if (err.message.includes('ECONNRESET')) return
  console.error('Uncaught exception:', err)
})

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 4321,
    proxy: {
      '/api': {
        target: 'http://localhost:9527',
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            // Suppress ECONNRESET from SSE/WebSocket proxy disconnections
            if (err.message.includes('ECONNRESET')) return
            console.error('Proxy error:', err)
          })
          proxy.on('proxyReqWs', (proxyReq) => {
            proxyReq.on('error', () => {}) // suppress WS proxy errors
          })
        },
      },
      '/uploads': {
        target: 'http://localhost:9527',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
