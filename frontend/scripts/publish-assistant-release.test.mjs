import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { publishAssistantRelease } from './publish-assistant-release.mjs'

test('publishes content-addressed artifacts and a channel manifest', () => {
  const frontendRoot = mkdtempSync(path.join(tmpdir(), 'kai-assistant-release-'))
  try {
    const distributionRoot = path.join(frontendRoot, 'dist-assistant')
    mkdirSync(distributionRoot, { recursive: true })
    writeFileSync(path.join(distributionRoot, 'kai-assistant.iife.js'), 'window.KaiAssistant={};')
    writeFileSync(path.join(distributionRoot, 'kai-assistant.es.js'), 'export const version=1;')

    const first = publishAssistantRelease({
      frontendRoot,
      channel: 'stable',
      releasedAt: '2026-08-26T03:40:00.000Z',
    })
    const second = publishAssistantRelease({
      frontendRoot,
      channel: 'canary',
      releasedAt: '2026-08-26T03:41:00.000Z',
    })

    assert.equal(first.version, second.version)
    assert.match(first.version, /^sha256-[a-f0-9]{12}$/)
    assert.match(first.artifacts.iife.integrity, /^sha384-/)
    const stable = JSON.parse(readFileSync(
      path.join(frontendRoot, 'public', 'assistant-sdk', 'channels', 'stable.json'), 'utf8'))
    assert.equal(stable.version, first.version)
    assert.equal(stable.channel, 'stable')
  } finally {
    rmSync(frontendRoot, { recursive: true, force: true })
  }
})

test('rejects unknown release channels', () => {
  assert.throws(() => publishAssistantRelease({ frontendRoot: '.', channel: 'latest' }),
    /Unsupported Assistant release channel/)
})

