import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readMobileConfig, prepareHarmony } from './config.mjs'

const valid = { origin: 'https://forge.example.com', startPath: '/tools/claude-chat', applicationId: 'com.example.forge', versionCode: 1, versionName: '0.1.0' }
function fixture(action) {
  const root = mkdtempSync(path.join(tmpdir(), 'forge-mobile-'))
  try {
    writeFileSync(path.join(root, 'forge-mobile.json'), JSON.stringify(valid))
    action(root)
  } finally { rmSync(root, { recursive: true, force: true }) }
}
test('rejects origins that expose the bridge to unexpected addresses or carry credentials', () => fixture(root => {
  for (const origin of ['http://forge.example.com', 'https://user:secret@forge.example.com', 'https://forge.example.com/path', 'https://forge.example.com?token=secret', 'https://forge.example.com#fragment']) {
    writeFileSync(path.join(root, 'forge-mobile.json'), JSON.stringify({ ...valid, origin }))
    assert.throws(() => readMobileConfig(root))
  }
}))
test('rejects injected application ids, start paths and invalid versions', () => fixture(root => {
  for (const invalid of [{ startPath: '//other.example.com' }, { applicationId: 'x";code' }, { versionCode: -1 }, { versionName: '"injected' }]) {
    writeFileSync(path.join(root, 'forge-mobile.json'), JSON.stringify({ ...valid, ...invalid }))
    assert.throws(() => readMobileConfig(root))
  }
}))
test('generates an exact proxy permission and keeps private signing outside tracked source', () => fixture(root => {
  mkdirSync(path.join(root, 'harmony/entry/src/main/ets'), { recursive: true })
  mkdirSync(path.join(root, 'harmony/AppScope'), { recursive: true })
  writeFileSync(path.join(root, 'harmony/AppScope/app.json5'), '{"app":{}}')
  writeFileSync(path.join(root, 'harmony/build-profile.template.json'), '{"app":{"products":[{}],"signingConfigs":[]}}')
  const local = { signingConfigs: [{ name: 'private', material: { secret: 'test-only' } }], sdkVersion: '5.0.0(12)' }
  writeFileSync(path.join(root, 'harmony/build-profile.local.json5'), JSON.stringify(local))
  const profile = prepareHarmony(root, readMobileConfig(root))
  assert.equal(profile.app.products[0].signingConfig, 'private')
  const constants = readFileSync(path.join(root, 'harmony/entry/src/main/ets/ForgeConfig.ets'), 'utf8')
  assert.ok(constants.includes('forge.example.com'))
  assert.ok(!constants.includes('test-only'))
  assert.ok(!constants.includes('"host":"*"'))
}))
test('preserves an existing DevEco signing profile instead of overwriting it', () => fixture(root => {
  mkdirSync(path.join(root, 'harmony'), { recursive: true })
  writeFileSync(path.join(root, 'harmony/build-profile.template.json'), '{"app":{"products":[{}],"signingConfigs":[]}}')
  const original = '{"app":{"signingConfigs":[{"name":"existing-device"}]}}'
  const profile = path.join(root, 'harmony/build-profile.json5')
  writeFileSync(profile, original)
  assert.throws(() => prepareHarmony(root, readMobileConfig(root)), /未覆盖/)
  assert.equal(readFileSync(profile, 'utf8'), original)
}))
test('does not expose private material when its JSON is malformed', () => fixture(root => {
  mkdirSync(path.join(root, 'harmony'), { recursive: true })
  writeFileSync(path.join(root, 'harmony/build-profile.template.json'), '{"app":{"products":[{}],"signingConfigs":[]}}')
  writeFileSync(path.join(root, 'harmony/build-profile.local.json5'), '{"secret":"do-not-log",bad}')
  assert.throws(() => prepareHarmony(root, readMobileConfig(root)), error => !error.message.includes('do-not-log') && error.message.includes('严格 JSON'))
}))
