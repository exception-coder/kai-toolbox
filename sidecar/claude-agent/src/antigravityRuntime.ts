import { execFile } from 'node:child_process'
import type { EngineProbeResult } from './engine/engineContract.js'

const PROBE_TIMEOUT_MS = 15_000
const MODEL_TIMEOUT_MS = 60_000
const PROBE_MAX_BUFFER = 256 * 1024
const MODEL_CACHE_TTL_MS = 5 * 60 * 1_000

let cachedModels: { expiresAt: number; models: AntigravityModelInfo[] } | undefined
let pendingModels: Promise<AntigravityModelInfo[]> | undefined

export interface AntigravityCommandResult {
  stdout: string
  stderr: string
}

export type AntigravityCommandRunner = (
  executable: string,
  args: readonly string[],
) => Promise<AntigravityCommandResult>

export interface AntigravityProbeOptions {
  executable?: string
  run?: AntigravityCommandRunner
}

export interface AntigravityModelInfo {
  value: string
  displayName: string
  description: string
  reasoningEfforts: string[]
  defaultReasoningEffort: string
  fastSupported: boolean
  isDefault: boolean
}

export function resolveAntigravityExecutable(env: NodeJS.ProcessEnv = process.env): string {
  return env.ANTIGRAVITY_CLI_PATH?.trim() || 'agy'
}

function runCommand(timeout: number): AntigravityCommandRunner {
  return (executable, args) => new Promise((resolve, reject) => {
  execFile(executable, [...args], {
    timeout,
    maxBuffer: PROBE_MAX_BUFFER,
    windowsHide: true,
  }, (error, stdout, stderr) => {
    if (error) {
      const detail = String(stderr || stdout || '').trim()
      const metadata = error.killed || error.signal
        ? ` (timeout=${timeout}ms, killed=${String(error.killed)}, signal=${String(error.signal ?? 'none')})`
        : ''
      const message = detail ? `${error.message}${metadata}: ${detail.slice(0, 500)}` : `${error.message}${metadata}`
      reject(Object.assign(new Error(message), { code: error.code }))
      return
    }
    resolve({ stdout, stderr })
  })
  })
}

const defaultRunner = runCommand(PROBE_TIMEOUT_MS)
const modelRunner = runCommand(MODEL_TIMEOUT_MS)

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  return 'code' in error ? String(error.code) : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Detect the external Antigravity CLI and require its structured-output contract. */
export async function probeAntigravityRuntime(
  options: AntigravityProbeOptions = {},
): Promise<EngineProbeResult> {
  const executable = options.executable ?? resolveAntigravityExecutable()
  const run = options.run ?? defaultRunner
  try {
    const [versionResult, helpResult] = await Promise.all([
      run(executable, ['--version']),
      run(executable, ['--help']),
    ])
    const version = (versionResult.stdout || versionResult.stderr).trim().split(/\r?\n/, 1)[0] || undefined
    const help = `${helpResult.stdout}\n${helpResult.stderr}`
    if (!help.includes('--output-format')) {
      return {
        status: 'incompatible',
        engine: 'antigravity',
        runtimeName: 'Antigravity CLI',
        runtimeVersion: version,
        detail: '当前 agy 不支持结构化输出，请运行 `agy update` 升级后重试',
      }
    }
    return {
      status: 'ready',
      engine: 'antigravity',
      runtimeName: 'Antigravity CLI',
      runtimeVersion: version,
      detail: `Antigravity CLI ${version ?? '版本未知'} 已就绪`,
    }
  } catch (error) {
    const code = errorCode(error)
    const missing = code === 'ENOENT' || code === 'UNKNOWN'
    return {
      status: missing ? 'dependencyMissing' : 'unavailable',
      engine: 'antigravity',
      runtimeName: 'Antigravity CLI',
      detail: missing
        ? '未找到 agy，请安装 Antigravity CLI 或配置 ANTIGRAVITY_CLI_PATH'
        : `Antigravity CLI 探测失败：${errorMessage(error).slice(0, 240)}`,
    }
  }
}

/** Read the authoritative model catalog exposed by the installed CLI. */
export async function listAntigravityModels(
  options: AntigravityProbeOptions = {},
): Promise<AntigravityModelInfo[]> {
  const executable = options.executable ?? resolveAntigravityExecutable()
  const run = options.run ?? modelRunner
  const load = async (): Promise<AntigravityModelInfo[]> => {
    const result = await run(executable, ['models'])
    const models = result.stdout.split(/\r?\n/).flatMap((line) => {
      const [value, ...labelParts] = line.trim().split(/\t+/)
      if (!value || labelParts.length === 0) return []
      const displayName = labelParts.join(' ').trim()
      const effort = /\((Low|Medium|High)\)\s*$/i.exec(displayName)?.[1]?.toLowerCase() ?? 'medium'
      return [{
        value,
        displayName,
        description: 'Antigravity CLI 本机可用模型',
        reasoningEfforts: [effort],
        defaultReasoningEffort: effort,
        fastSupported: false,
        isDefault: false,
      }]
    })
    if (models.length === 0) throw new Error('agy models 未返回可用模型')
    return models
  }

  // 测试/自定义 runner 不共享进程缓存，避免不同调用者互相污染。
  if (options.run) return load()
  if (cachedModels && cachedModels.expiresAt > Date.now()) return cachedModels.models
  if (pendingModels) return pendingModels
  pendingModels = load()
    .then(models => {
      cachedModels = { expiresAt: Date.now() + MODEL_CACHE_TTL_MS, models }
      return models
    })
    .catch(error => {
      if (cachedModels) return cachedModels.models
      throw error
    })
    .finally(() => { pendingModels = undefined })
  return pendingModels
}
