import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import postcss from 'postcss'

const output = fileURLToPath(new URL('../dist-session-client/', import.meta.url))
const read = name => readFileSync(path.join(output, name), 'utf8')
const manifest = JSON.parse(read('package.json'))
for (const entry of ['.', './react']) {
  assert.ok(read(manifest.exports[entry].import))
  assert.ok(read(manifest.exports[entry].types))
}
assert.equal(manifest.peerDependencies.react, '^19.0.0')
assert.doesNotMatch(read(manifest.exports['.'].import), /from\s*["']react(?:\/|["'])/)
assert.match(read(manifest.exports['./react'].import), /from\s*["']react["']/)
assert.doesNotMatch(read(manifest.exports['./react'].import), /Yoooni One|@\/shared/)

let ruleCount = 0
postcss.parse(read(manifest.exports['./style.css'])).walkRules(rule => {
  if (rule.parent?.type === 'rule' || rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name)) return
  for (const selector of rule.selectors) {
    assert.ok(selector.startsWith('.forge-collaboration-workbench'), `Unscoped SDK selector: ${selector}`)
  }
  ruleCount++
})
assert.ok(ruleCount > 20, 'Compiled workbench utilities are missing')
console.log('Session client package exports, React boundary and CSS isolation passed.')
