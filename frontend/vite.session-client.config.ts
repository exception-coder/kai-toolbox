import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  publicDir: false,
  plugins: [{
    name: 'session-client-package-artifacts',
    closeBundle() {
      const out = path.resolve(__dirname, 'dist-session-client')
      mkdirSync(out, { recursive: true })
      writeFileSync(path.join(out, 'package.json'), JSON.stringify({
        name: '@kai/session-client',
        version: '0.1.0',
        type: 'module',
        module: './kai-session-client.es.js',
        types: './types/session-client-sdk/index.d.ts',
        exports: { '.': { types: './types/session-client-sdk/index.d.ts', import: './kai-session-client.es.js' } },
      }, null, 2))
      copyFileSync(path.resolve(__dirname, 'src/session-client-sdk/README.md'), path.join(out, 'README.md'))
    },
  }],
  build: {
    outDir: 'dist-session-client',
    emptyOutDir: true,
    lib: {
      entry: path.resolve(__dirname, 'src/session-client-sdk/index.ts'),
      name: 'KaiSessionClient',
      formats: ['es'],
      fileName: () => 'kai-session-client.es.js',
    },
  },
})
