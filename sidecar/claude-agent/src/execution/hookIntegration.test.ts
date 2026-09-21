import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { git } from './repository.js'
import { discoverExecution } from './context.js'
import { assessExecution } from './service.js'
import { runExecutionVerification } from './verification.js'

const hooks = process.env.TEAM_STANDARDS_TEST_HOOK_ROOT
test('real plugin Hook → Forge CLI: read-only init, scope, branch, verification and stale inputs', { skip: !hooks }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-hook-v2-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.name', 'Fixture']); git(root, ['config', 'user.email', 'fixture@example.invalid'])
  fs.writeFileSync(path.join(root, '.gitignore'), '.forge/\n')
  fs.writeFileSync(path.join(root, 'src.js'), 'const value = 1\n')
  fs.writeFileSync(path.join(root, 'README.md'), 'The value should equal two.\n')
  fs.writeFileSync(path.join(root, 'check.cjs'), "require('node:assert/strict').match(require('node:fs').readFileSync('src.js','utf8'), /value = 2/)")
  git(root, ['add', 'src.js', 'README.md', '.gitignore', 'check.cjs']); git(root, ['commit', '-qm', 'baseline'])
  const context = { project: root, sessionId: 'integration-host' }
  const env = { ...process.env, FORGE_EXECUTION_PROTOCOL: '2',
    FORGE_SPEC_RESOLUTION_CLI: fileURLToPath(new URL('../specResolution/cli.js', import.meta.url)),
    FORGE_OPENSPEC_CHANGE: '', TEAM_STANDARDS_SPEC_RESOLUTION_FAILURE: '', TEAM_STANDARDS_SPEC_RESOLUTION_HOOK: 'warn',
    TEAM_STANDARDS_OPENSPEC_GOVERNANCE_HOOK: 'block', TEAM_STANDARDS_OPENSPEC_LEGACY_APPROVED: '',
    TEAM_STANDARDS_GOVERNANCE_DATA: path.join(root, '.forge', 'legacy-test'),
    TEAM_STANDARDS_HOOK_EVENT_DIR: path.join(root, '.forge', 'events') }
  const invoke = (script: string, payload: object) => spawnSync(process.execPath, [path.join(hooks!, script)], {
    input: JSON.stringify({ cwd: root, session_id: context.sessionId, ...payload }), encoding: 'utf8', env, windowsHide: true,
  })
  const start = invoke('session-init.js', { hook_event_name: 'SessionStart' })
  assert.equal(start.status, 0, start.stderr)
  const init = JSON.parse(start.stdout)
  assert.match(init.hookSpecificOutput.additionalContext, /integration-host/)
  assert.equal(fs.existsSync(path.join(root, '.forge')), false, 'read-only init must not create project state')
  assessExecution({ ...context,
    discoveryId: discoverExecution({ ...context, request: 'Restore documented value', files: ['src.js', 'check.cjs'] }).discoveryId,
    actor: 'integration', behavior: 'preserved', design: 'none', impacts: ['logic'],
    reason: 'Restore the documented value without changing the accepted contract.',
    evidence: [{ path: 'README.md', quote: 'The value should equal two.' }],
  })
  const write = (file: string) => invoke('check-spec-resolution.js', { hook_event_name: 'PreToolUse', tool_name: 'Write',
    tool_input: { file_path: path.join(root, file), content: 'const value = 2' } })
  const shell = (command: string) => invoke('check-spec-resolution.js', { hook_event_name: 'PreToolUse', tool_name: 'exec_command', tool_input: { cmd: command } })
  assert.equal(write('src.js').status, 0)
  assert.equal(write('other.js').status, 2)
  assert.equal(shell('git switch -c surprise').status, 2)
  assert.equal(shell('git commit -F message').status, 2)
  const stop = invoke('check-openspec-governance.js', { hook_event_name: 'Stop' })
  assert.equal(JSON.parse(stop.stdout).decision, 'block', 'non-OpenSpec execution must still check Stop')
  fs.writeFileSync(path.join(root, 'src.js'), 'const value = 2\n')
  assert.equal((await runExecutionVerification({ ...context, inputFiles: ['check.cjs'],
    checks: [{ kind: 'regression', program: process.execPath, args: ['check.cjs'], purpose: 'Verify the documented value equals two' }] })).allowed, true)
  git(root, ['add', 'src.js'])
  assert.equal(shell('git commit -F message').status, 0)
  fs.writeFileSync(path.join(root, 'src.js'), 'const value = 3\n')
  assert.equal(shell('git commit -F message').status, 2)
})
