import { spawnSync } from 'node:child_process'
import { existsSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(scriptDirectory, '..')
const outputDirectory = join(projectDirectory, 'dist')
const stageDirectory = join(projectDirectory, `.dist-stage-${process.pid}`)
const backupDirectory = join(projectDirectory, `.dist-backup-${process.pid}`)
const sidecarPort = Number(process.env.CLAUDE_CHAT_SIDECAR_PORT || 18890)

function runTypeScriptCompiler(outDir) {
  const compiler = join(projectDirectory, 'node_modules', 'typescript', 'bin', 'tsc')
  const result = spawnSync(process.execPath, [compiler, '--project', join(projectDirectory, 'tsconfig.json'), '--outDir', outDir], {
    cwd: projectDirectory,
    encoding: 'utf8',
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`TypeScript 编译失败（exit ${result.status ?? 'unknown'}）`)
}

function assertRuntimeArtifacts(directory) {
  for (const file of ['server.js', 'toolboxMcpBridge.js', 'build-manifest.json']) {
    const path = join(directory, file)
    if (!existsSync(path)) throw new Error(`Sidecar 构建产物不完整：缺少 ${path}`)
  }
}

function isPortListening(port) {
  return new Promise(resolveListening => {
    const socket = connect({ host: '127.0.0.1', port })
    const finish = listening => {
      socket.removeAllListeners()
      socket.destroy()
      resolveListening(listening)
    }
    socket.setTimeout(500)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function promoteStage() {
  rmSync(backupDirectory, { recursive: true, force: true })
  if (existsSync(outputDirectory)) renameSync(outputDirectory, backupDirectory)
  try {
    renameSync(stageDirectory, outputDirectory)
    rmSync(backupDirectory, { recursive: true, force: true })
  } catch (error) {
    if (!existsSync(outputDirectory) && existsSync(backupDirectory)) {
      renameSync(backupDirectory, outputDirectory)
    }
    throw error
  }
}

rmSync(stageDirectory, { recursive: true, force: true })
try {
  runTypeScriptCompiler(stageDirectory)
  writeFileSync(join(stageDirectory, 'build-manifest.json'), JSON.stringify({
    buildId: `${Date.now()}-${process.pid}`,
    builtAt: new Date().toISOString(),
  }, null, 2))
  assertRuntimeArtifacts(stageDirectory)
  if (await isPortListening(sidecarPort)) {
    throw new Error(`Sidecar 仍在监听 127.0.0.1:${sidecarPort}，已保留当前 dist。请通过 Forge 重启服务后再构建。`)
  }
  promoteStage()
  console.log('Sidecar build completed and promoted to dist.')
} catch (error) {
  console.error(`[sidecar-build] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  rmSync(stageDirectory, { recursive: true, force: true })
}
