import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import { createInterface } from 'node:readline'
import { dirname, join, resolve } from 'node:path'
import { homedir } from 'node:os'

const require = createRequire(import.meta.url)
const REQUEST_TIMEOUT_MS = 20_000

type JsonRpcResponse = {
  id?: number
  result?: JsonRpcResult
  error?: {
    code?: number
    message?: string
  }
}

type JsonRpcResult = {
  thread?: {
    id?: string
    turns?: Array<{ id?: string }>
  }
}

function normalizeCodexHome(value?: string): string | undefined {
  const raw = value?.trim()
  if (!raw) return undefined
  return resolve(raw
    .replace(/^~(?=[\\/]|$)/, homedir())
    .replace(/%([^%]+)%/g, (_, name: string) => process.env[name] ?? `%${name}%`)
    .replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/gi, (_, name: string) => process.env[name] ?? `$env:${name}`))
}

function appServerEnv(codexHome?: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env }
  // 业务会话必须使用它自己选择的授权目录，不能继承启动 kai-toolbox 的 Codex 会话身份。
  delete env.CODEX_THREAD_ID
  delete env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE
  const home = normalizeCodexHome(codexHome)
  if (home) env.CODEX_HOME = home
  return env
}

function codexCliEntrypoint(): string {
  const packageJson = require.resolve('@openai/codex/package.json')
  return join(dirname(packageJson), 'bin', 'codex.js')
}

function stop(child: ChildProcessWithoutNullStreams): void {
  if (!child.stdin.destroyed) child.stdin.end()
  if (!child.killed) child.kill()
}

function callAppServer(
  method: string,
  params: Record<string, unknown>,
  codexHome?: string,
): Promise<JsonRpcResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      process.execPath,
      [codexCliEntrypoint(), 'app-server', '--stdio'],
      {
        env: appServerEnv(codexHome),
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    )
    const lines = createInterface({ input: child.stdout })
    let stderr = ''
    let settled = false

    const finish = (error?: Error, result?: JsonRpcResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      lines.close()
      stop(child)
      if (error) rejectPromise(error)
      else resolvePromise(result ?? {})
    }

    const send = (message: Record<string, unknown>) => {
      child.stdin.write(JSON.stringify(message) + '\n')
    }

    const timer = setTimeout(() => {
      const detail = stderr.trim()
      finish(new Error(`Codex ${method} 超时${detail ? `：${detail}` : ''}`))
    }, REQUEST_TIMEOUT_MS)

    child.stderr.setEncoding('utf8')
    child.stderr.on('data', chunk => {
      stderr = (stderr + String(chunk)).slice(-4000)
    })
    child.on('error', error => finish(error))
    child.on('exit', code => {
      if (!settled) {
        const detail = stderr.trim()
        finish(new Error(`Codex App Server 异常退出（${code ?? 'unknown'}）${detail ? `：${detail}` : ''}`))
      }
    })

    lines.on('line', line => {
      let message: JsonRpcResponse
      try {
        message = JSON.parse(line) as JsonRpcResponse
      } catch {
        return
      }
      if (message.id === 0) {
        if (message.error) {
          finish(new Error(message.error.message ?? 'Codex App Server 初始化失败'))
          return
        }
        send({ method: 'initialized', params: {} })
        send({
          method,
          id: 1,
          params,
        })
        return
      }
      if (message.id !== 1) return
      if (message.error) {
        finish(new Error(message.error.message ?? `Codex ${method} 失败（${message.error.code ?? 'unknown'}）`))
        return
      }
      finish(undefined, message.result)
    })

    send({
      method: 'initialize',
      id: 0,
      params: {
        clientInfo: {
          name: 'kai_toolbox',
          title: 'Kai Toolbox',
          version: '0.1.0',
        },
      },
    })
  })
}

/** 通过 Codex App Server 的稳定 thread/fork API 复制到指定 turn（含）为止。 */
export async function forkCodexThread(
  threadId: string,
  options: { lastTurnId?: string; codexHome?: string } = {},
): Promise<string> {
  const result = await callAppServer('thread/fork', {
    threadId,
    ...(options.lastTurnId ? { lastTurnId: options.lastTurnId } : {}),
  }, options.codexHome)
  const forkedId = result.thread?.id
  if (!forkedId) throw new Error('Codex thread/fork 未返回新 thread id')
  return forkedId
}

/** 读取当前 thread 最新一轮的 turn id，作为消息底部“从这里分叉”的锚点。 */
export async function latestCodexTurnId(threadId: string, codexHome?: string): Promise<string | undefined> {
  const result = await callAppServer('thread/read', { threadId, includeTurns: true }, codexHome)
  const turns = result.thread?.turns ?? []
  return turns.at(-1)?.id
}
