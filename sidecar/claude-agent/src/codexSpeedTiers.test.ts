import assert from 'node:assert/strict'
import test from 'node:test'
import { codexServiceTier, codexSpeedTiers, normalizeCodexSpeed, speedFields } from './codexSpeedTiers.js'

test('历史 fast 与 Codex priority 统一为 fast，未知值回到标准', () => {
  assert.equal(normalizeCodexSpeed('fast'), 'fast')
  assert.equal(normalizeCodexSpeed('priority'), 'fast')
  assert.equal(normalizeCodexSpeed('ultrafast'), 'ultrafast')
  assert.equal(normalizeCodexSpeed('default'), 'default')
  assert.equal(normalizeCodexSpeed('Bad Tier'), 'default')
  assert.equal(normalizeCodexSpeed(undefined), 'default')
})

test('请求只为非标准档位传 service_tier，新档位原样透传', () => {
  assert.equal(codexServiceTier('default'), undefined)
  assert.equal(codexServiceTier('fast'), 'priority')
  assert.equal(codexServiceTier('ultrafast'), 'ultrafast')
})

test('优先使用 serviceTiers，缺失时退回旧字段并去重', () => {
  const declared = codexSpeedTiers([
    { id: 'priority', name: 'Fast', description: '2x speed' },
    { id: 'ultrafast', name: 'Ultrafast', description: 'The fastest' },
    { id: 'default', name: 'Standard' },
  ], ['fast'])
  assert.deepEqual(declared, [
    { value: 'fast', label: 'Fast', description: '2x speed' },
    { value: 'ultrafast', label: 'Ultrafast', description: 'The fastest' },
  ])
  assert.deepEqual(codexSpeedTiers(undefined, ['fast', 'priority', 'ultrafast']).map(tier => tier.value), ['fast', 'ultrafast'])
  assert.deepEqual(codexSpeedTiers([], []), [])
  assert.deepEqual(speedFields(declared).fastSupported, true)
  assert.deepEqual(speedFields(codexSpeedTiers(undefined, ['ultrafast'])).fastSupported, false)
})
