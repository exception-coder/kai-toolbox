import { defineConfig } from 'vite'
import path from 'node:path'
import { copyFileSync, writeFileSync } from 'node:fs'

export default defineConfig({
  publicDir: false,
  plugins: [{
    name: 'assistant-package-artifacts',
    closeBundle() {
      writeFileSync(path.resolve(__dirname, 'dist-assistant/package.json'), JSON.stringify({
        name: '@kai/assistant-sdk',
        version: '0.1.0',
        type: 'module',
        module: './kai-assistant.es.js',
        browser: './kai-assistant.iife.js',
        types: './types/assistant-sdk/standalone.d.ts',
        exports: {
          '.': {
            types: './types/assistant-sdk/standalone.d.ts',
            import: './kai-assistant.es.js',
          },
        },
      }, null, 2))
      copyFileSync(
        path.resolve(__dirname, 'src/assistant-sdk/README.md'),
        path.resolve(__dirname, 'dist-assistant/README.md'),
      )
    },
  }],
  build: {
    outDir: 'dist-assistant',
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, 'src/assistant-sdk/standalone.ts'),
      name: 'KaiAssistant',
      formats: ['es', 'iife'],
      fileName: format => `kai-assistant.${format === 'es' ? 'es' : 'iife'}.js`,
    },
  },
})
