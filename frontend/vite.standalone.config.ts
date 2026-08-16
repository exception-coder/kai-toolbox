import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

const standaloneRoot = path.resolve(__dirname, 'src/features/supplier-quote-h5/standalone')

export default defineConfig({
  root: standaloneRoot,
  publicDir: path.resolve(standaloneRoot, 'public'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-pages/supplier-quote-h5'),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    host: true,
    port: 5180,
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 4180,
    allowedHosts: true,
  },
})
