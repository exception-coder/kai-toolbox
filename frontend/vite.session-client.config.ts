import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import postcss from 'postcss'

export default defineConfig({
  publicDir: false,
  plugins: [tailwindcss(), {
    name: 'session-client-package-artifacts',
    generateBundle: { order: 'post', handler(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.css')) continue
        const css = postcss.parse(String(asset.source))
        css.walkRules(rule => {
          // Keep nested selectors and keyframes relative to their scoped parent.
          if (rule.parent?.type === 'rule' || rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return
          rule.selectors = rule.selectors.map(selector => {
            if (selector.includes('.forge-collaboration-workbench')) return selector
            if (selector === ':root' || selector === ':host') return '.forge-collaboration-workbench'
            return `.forge-collaboration-workbench ${selector}`
          })
        })
        asset.source = css.toString()
      }
    } },
    closeBundle() {
      const out = path.resolve(__dirname, 'dist-session-client')
      mkdirSync(out, { recursive: true })
      writeFileSync(path.join(out, 'package.json'), JSON.stringify({
        name: '@kai/session-client',
        version: '0.1.0',
        type: 'module',
        module: './kai-session-client.es.js',
        types: './types/session-client-sdk/index.d.ts',
        exports: {
          '.': { types: './types/session-client-sdk/index.d.ts', import: './kai-session-client.es.js' },
          './react': { types: './types/session-client-sdk/react/index.d.ts', import: './kai-session-client-react.es.js' },
          './style.css': './style.css',
        },
        peerDependencies: { react: '^19.0.0' },
        peerDependenciesMeta: { react: { optional: true } },
        sideEffects: ['*.css'],
      }, null, 2))
      copyFileSync(path.resolve(__dirname, 'src/session-client-sdk/README.md'), path.join(out, 'README.md'))
    },
  }],
  build: {
    outDir: 'dist-session-client',
    emptyOutDir: true,
    lib: {
      entry: {
        'kai-session-client': path.resolve(__dirname, 'src/session-client-sdk/index.ts'),
        'kai-session-client-react': path.resolve(__dirname, 'src/session-client-sdk/react/index.ts'),
      },
      name: 'KaiSessionClient',
      formats: ['es'],
      fileName: (_format, entry) => `${entry}.es.js`,
      cssFileName: 'style',
    },
    rollupOptions: { external: ['react', 'react/jsx-runtime'] },
  },
})
