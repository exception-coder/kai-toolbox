import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { isArchivedCodexResumeError, isArchivedCodexThread } from './codexEngine.js'

test('detects a Codex thread moved to archived_sessions', () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-home-'))
  try {
    const archiveDir = join(home, 'archived_sessions')
    mkdirSync(archiveDir)
    writeFileSync(join(archiveDir, 'rollout-2026-08-26-thread-123.jsonl'), '')
    assert.equal(isArchivedCodexThread('thread-123', home), true)
    assert.equal(isArchivedCodexThread('thread-active', home), false)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('uses the default CODEX_HOME when the session does not specify one', () => {
  const home = mkdtempSync(join(tmpdir(), 'codex-home-'))
  const previous = process.env.CODEX_HOME
  try {
    process.env.CODEX_HOME = home
    const archiveDir = join(home, 'archived_sessions')
    mkdirSync(archiveDir)
    writeFileSync(join(archiveDir, 'rollout-thread-default.jsonl'), '')
    assert.equal(isArchivedCodexThread('thread-default', undefined), true)
  } finally {
    if (previous === undefined) delete process.env.CODEX_HOME
    else process.env.CODEX_HOME = previous
    rmSync(home, { recursive: true, force: true })
  }
})

test('recognizes the Codex archived resume failure for one safe retry', () => {
  assert.equal(isArchivedCodexResumeError(new Error(
    'thread/resume: thread/resume failed: session thread-123 is archived. Run codex unarchive first.',
  )), true)
  assert.equal(isArchivedCodexResumeError(new Error('authentication failed')), false)
})
