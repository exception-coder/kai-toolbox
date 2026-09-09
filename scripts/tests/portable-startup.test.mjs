import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const task = process.env.FORGE_TASK_BIN || 'task'
const root = resolve(import.meta.dirname, '../..')

function cleanupFixture(directory) {
  assert.ok(resolve(directory).startsWith(join(resolve(tmpdir()), 'forge ')))
  rmSync(directory, { recursive: true, force: true })
}

test('native dev delegates to Maven/npm and disables source updates only for backend', () => {
  const directory = mkdtempSync(join(tmpdir(), 'forge task fixture '))
  try {
    copyFileSync(join(root, 'Taskfile.yml'), join(directory, 'Taskfile.yml'))
    mkdirSync(join(directory, 'sidecar/claude-agent/dist'), { recursive: true })
    mkdirSync(join(directory, 'frontend/node_modules'), { recursive: true })
    writeFileSync(join(directory, 'sidecar/claude-agent/dist/server.js'), '')
    const log = join(directory, 'calls.jsonl')
    const probe = join(directory, 'probe.mjs')
    writeFileSync(probe, `import {appendFileSync} from 'node:fs';appendFileSync(process.env.FORGE_TEST_LOG, JSON.stringify({args:process.argv.slice(2), cwd:process.cwd(), update:process.env.TOOLBOX_AUTO_UPDATE_ENABLED, supervised:process.env.KAI_SUPERVISED})+'\\n');`)
    const executable = `node "${probe.replaceAll('\\', '/')}"`
    execFileSync(task, ['--dir', directory, 'dev', `MVN=${executable}`, `NPM=${executable}`], {
      env: { ...process.env, FORGE_TEST_LOG: log, TOOLBOX_AUTO_UPDATE_ENABLED: 'true', KAI_SUPERVISED: '1' },
      timeout: 30000,
    })
    const calls = readFileSync(log, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
    assert.equal(calls.length, 2)
    const backend = calls.find(call => call.args.includes('spring-boot:run'))
    assert.ok(backend)
    assert.equal(backend.update, 'false')
    assert.equal(backend.supervised, '0')
    assert.ok(!backend.args.includes('-am'))
    assert.deepEqual(calls.find(call => call.args.includes('dev')).args, ['run', 'dev', '--', '--strictPort'])
  } finally {
    cleanupFixture(directory)
  }
})

test('missing packaged artifact fails before starting Java', () => {
  const directory = mkdtempSync(join(tmpdir(), 'forge missing artifact '))
  try {
    copyFileSync(join(root, 'Taskfile.yml'), join(directory, 'Taskfile.yml'))
    assert.throws(() => execFileSync(task, ['--dir', directory, 'run'], { timeout: 30000, stdio: 'pipe' }),
      error => error.status !== 0 && error.stderr.toString().includes('Run task build first'))
  } finally {
    cleanupFixture(directory)
  }
})

test('Compose requires image selection, binds loopback and retains named data', () => {
  const file = join(root, 'deploy/local-dependencies/compose.yml')
  const env = { ...process.env }
  delete env.FORGE_PHOENIX_IMAGE
  assert.throws(() => execFileSync('docker', ['compose', '-f', file, 'config', '--quiet'], {
    env, timeout: 30000, stdio: 'pipe',
  }), error => error.status !== 0 && error.stderr.toString().includes('FORGE_PHOENIX_IMAGE'))
  const config = JSON.parse(execFileSync('docker', ['compose', '-f', file, 'config', '--format', 'json'], {
    env: { ...env, FORGE_PHOENIX_IMAGE: 'arizephoenix/phoenix:test-fixture', FORGE_PHOENIX_PORT: '16006' },
    timeout: 30000, encoding: 'utf8',
  }))
  assert.equal(config.services.phoenix.ports[0].host_ip, '127.0.0.1')
  assert.equal(config.services.phoenix.ports[0].published, '16006')
  assert.equal(config.services.phoenix.volumes[0].type, 'volume')
  assert.equal(config.services.phoenix.restart, 'unless-stopped')
})
