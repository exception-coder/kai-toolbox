import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(scriptDirectory, '..')
const requestedId = readArgument('--id') ?? 'supplier-quote-h5'

if (requestedId !== 'supplier-quote-h5') {
  console.error(`[standalone-build] 未登记页面: ${requestedId}`)
  process.exit(1)
}

const viteBin = path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js')
const result = spawnSync(process.execPath, [viteBin, 'build', '--config', 'vite.standalone.config.ts'], {
  cwd: frontendRoot,
  stdio: 'inherit',
})

if (result.error) throw result.error
process.exit(result.status ?? 1)

function readArgument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}
