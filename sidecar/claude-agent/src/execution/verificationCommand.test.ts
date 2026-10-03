import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { verificationCommand } from './verificationCommand.js'

test('Windows OpenSpec shim resolves to the installed Node entry without a shell', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-cli-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const directory = path.join(root, 'node_modules/@fission-ai/openspec')
  fs.mkdirSync(directory, { recursive: true })
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: '@fission-ai/openspec', bin: { openspec: 'cli.cjs' } }))
  fs.writeFileSync(path.join(directory, 'cli.cjs'), 'process.stdout.write(JSON.stringify(process.argv.slice(2)))')
  const command = verificationCommand('openspec', ['validate', 'a & b'], root, 'win32')
  assert.equal(command.program, process.execPath)
  assert.equal(execFileSync(command.program, command.args, { encoding: 'utf8', windowsHide: true }), '["validate","a & b"]')
  assert.throws(() => verificationCommand(path.join(root, 'missing', 'openspec.cmd'), [], root, 'win32'), /未找到/)
})
