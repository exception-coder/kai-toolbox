import { test } from 'node:test'
import assert from 'node:assert/strict'
import { maskPresentation } from './check-consult-suggestion-patch.mjs'

test('allows existing text and presentation attributes', () => {
  assert.equal(maskPresentation('<button className="p-2" title="复制">复制</button>'), maskPresentation('<button className="p-3" title="复制回答">复制回答</button>'))
})
test('Git checkout line endings do not masquerade as program changes', () => {
  assert.equal(maskPresentation('export const X = () => <p>复制</p>\n'), maskPresentation('export const X = () => <p>复制回答</p>\r\n'))
})
test('rejects permission, handlers, imports and network changes', () => {
  for (const [a, b] of [
    ['<button disabled={true}>复制</button>', '<button disabled={false}>复制</button>'],
    ['<button onClick={copy}>复制</button>', '<button onClick={erase}>复制</button>'],
    ['import x from "x"', 'import x from "malicious"'],
    ['fetch("/safe")', 'fetch("/admin")'],
    ['<a href="/safe">链接</a>', '<a href="https://external">链接</a>'],
    ['const x = "a"', 'const x = "b"'],
  ]) assert.notEqual(maskPresentation(a), maskPresentation(b))
})
