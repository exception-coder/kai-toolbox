// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from '@tailwindcss/node'
import { Scanner } from '@tailwindcss/oxide'
import { expect, it } from 'vitest'

it('compiles the UI without scanning parent directories and preserves the HTML loading shell styles', async () => {
  const stylesheet = fileURLToPath(new URL('../index.css', import.meta.url))
  const sourceRoot = dirname(stylesheet)
  const frontendRoot = dirname(sourceRoot)
  const compiler = await compile(await readFile(stylesheet, 'utf8'), {
    base: sourceRoot,
    onDependency: () => {},
  })
  const sources = compiler.root === 'none' ? []
    : compiler.root === null ? [{ base: frontendRoot, pattern: '**/*', negated: false }]
      : [{ ...compiler.root, negated: false }]
  const scanner = new Scanner({ sources: [...sources, ...compiler.sources] })
  const candidates = scanner.scan()
  const files = scanner.files.map(file => resolve(file))
  const unexpectedFiles = files.filter(file => !file.startsWith(sourceRoot + sep))

  expect(unexpectedFiles).toEqual([])
  expect(files).not.toContain(resolve(frontendRoot, 'index.html'))
  expect(files).toContain(resolve(sourceRoot, 'shell/AppShell.tsx'))
  const styles = compiler.build(candidates)
  expect(styles).toContain('.bg-background')
  // The loading shell uses inline custom CSS. Its tokens must not add utilities;
  // scanning its content in memory checks that without widening filesystem traversal.
  const html = await readFile(resolve(frontendRoot, 'index.html'), 'utf8')
  const htmlCandidates = new Scanner({ sources: [] }).scanFiles([{ content: html, extension: 'html' }])
  expect(compiler.build([...candidates, ...htmlCandidates])).toBe(styles)
})
