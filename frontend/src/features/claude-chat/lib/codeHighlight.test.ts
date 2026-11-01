import { expect, it } from 'vitest'
import { highlightCode } from './codeHighlight'

it('uses the real grammar and CSS tokens without changing code text', async () => {
  const source = '// source\nconst message = "<script>literal</script>";\nconsole.log(42)\n'
  const lines = await highlightCode(source, 'js')
  expect(lines).not.toBeNull()
  expect(lines!.map(line => line.map(token => token.content).join('')).join('\n')).toBe(source)
  const colors = lines!.flat().map(token => token.color)
  expect(colors.some(color => color?.includes('--wb-keyword'))).toBe(true)
  expect(colors.some(color => color?.includes('--wb-string'))).toBe(true)
  expect(colors.some(color => color?.includes('--wb-syntax-number'))).toBe(true)
}, 15000)

it('preserves unknown languages and limits expensive large blocks', async () => {
  expect(await highlightCode('unknown code', 'not-a-language')).toBeNull()
  expect(await highlightCode('x'.repeat(30001), 'javascript')).toBeNull()
  expect(await highlightCode('x\n'.repeat(601), 'sql')).toBeNull()
  const diff = await highlightCode('@@ -1 +1 @@\n-old\n+new', 'diff')
  expect(diff!.map(line => line.map(token => token.content).join('')).join('\n')).toBe('@@ -1 +1 @@\n-old\n+new')
}, 15000)

it('loads the workbench Java, SQL, TSX and Python grammars on demand', async () => {
  for (const [language, source] of [
    ['java', 'public class Task { int id = 42; }'],
    ['sql', 'SELECT id FROM tasks WHERE state = \'ready\';'],
    ['tsx', 'const App = () => <button disabled={false}>Ready</button>'],
    ['python', 'def run():\n    return "ready"'],
  ]) {
    const tokens = await highlightCode(source!, language!)
    expect(tokens!.map(line => line.map(token => token.content).join('')).join('\n')).toBe(source)
    expect(tokens!.flat().some(token => token.color?.includes('--wb-keyword'))).toBe(true)
  }
}, 20000)
