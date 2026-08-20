import { spawnSync } from 'node:child_process'
import { readdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(scriptDirectory, '..')
const outputDirectory = join(projectDirectory, '.test-dist')

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectDirectory,
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exitCode = result.status ?? 1
  return result.status === 0
}

function findTests(directory) {
  const result = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...findTests(path))
    else if (entry.isFile() && entry.name.endsWith('.test.js')) result.push(path)
  }
  return result.sort()
}

rmSync(outputDirectory, { recursive: true, force: true })
try {
  const compiler = join(projectDirectory, 'node_modules', 'typescript', 'bin', 'tsc')
  const compiled = run(process.execPath, [compiler, '--project', join(projectDirectory, 'tsconfig.json'), '--outDir', outputDirectory])
  if (compiled) {
    const tests = findTests(outputDirectory)
    if (tests.length === 0) throw new Error('Sidecar 测试编译成功，但没有找到任何测试文件')
    run(process.execPath, ['--test', ...tests])
  }
} finally {
  rmSync(outputDirectory, { recursive: true, force: true })
}
