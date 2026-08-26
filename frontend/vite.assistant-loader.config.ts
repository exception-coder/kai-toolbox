import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'public/assistant-sdk',
    emptyOutDir: false,
    lib: {
      entry: path.resolve(__dirname, 'src/assistant-loader/loader.ts'),
      name: 'KaiAssistantLoaderBundle',
      formats: ['iife'],
      fileName: () => 'loader.js',
    },
  },
})

