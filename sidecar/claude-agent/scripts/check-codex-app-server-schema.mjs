import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)
const expectedServerRequests = [
  'account/chatgptAuthTokens/refresh',
  'applyPatchApproval',
  'attestation/generate',
  'execCommandApproval',
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/permissions/requestApproval',
  'item/tool/call',
  'item/tool/requestUserInput',
  'mcpServer/elicitation/request',
].sort()

const schemaDirectory = mkdtempSync(join(tmpdir(), 'kai-codex-schema-'))
try {
  const packageJson = require.resolve('@openai/codex/package.json')
  const cli = join(dirname(packageJson), 'bin', 'codex.js')
  const generated = spawnSync(process.execPath, [cli, 'app-server', 'generate-ts', '--out', schemaDirectory], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (generated.status !== 0) {
    throw new Error(`Codex App Server schema generation failed: ${generated.stderr || generated.stdout}`)
  }

  const source = readFileSync(join(schemaDirectory, 'ServerRequest.ts'), 'utf8')
  const actual = [...source.matchAll(/"method":\s*"([^"]+)"/g)].map(match => match[1]).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expectedServerRequests)) {
    throw new Error([
      'Codex App Server server-request schema changed.',
      `Expected: ${expectedServerRequests.join(', ')}`,
      `Actual: ${actual.join(', ')}`,
      'Update the request router and its tests before upgrading Codex.',
    ].join('\n'))
  }
  console.log(`Codex App Server schema check passed (${actual.length} server request methods).`)
} finally {
  rmSync(schemaDirectory, { recursive: true, force: true })
}
