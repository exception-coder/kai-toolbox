import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { observeCodexProcess } from './codexProcessLifetime.js'
import { CodexRpcTimeoutError } from './engine/codexRpcPolicy.js'
import { jsonLineWriter } from './jsonLineWriter.js'

type Message = Record<string, unknown>
type JsonRpcMessageKind = 'response' | 'notification' | 'serverRequest' | 'invalid'

export function classifyCodexAppServerMessage(message: Message): JsonRpcMessageKind {
  const hasId = typeof message.id === 'number' || typeof message.id === 'string'
  const hasMethod = typeof message.method === 'string' && message.method.trim().length > 0
  if (hasId && hasMethod) return 'serverRequest'
  if (hasId && ('result' in message || 'error' in message)) return 'response'
  if (!hasId && hasMethod) return 'notification'
  return 'invalid'
}

function record(value: unknown): Message | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Message : undefined
}

interface Route {
  threadId: () => string | undefined
  turnId: () => string | undefined
  onMessage: (message: Message, kind: 'notification' | 'serverRequest') => void
  onFailure: (error: Error) => void
}

interface PendingRequest {
  route: Route
  resolve: (result: Message) => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
}

/** Owns the wire protocol. Process reuse and writer ownership belong to its caller. */
export function createCodexAppServerConnection(child: ChildProcessWithoutNullStreams, closeTimeoutMs: number,
  routing: 'exclusive' | 'shared') {
  const lifetime = observeCodexProcess(child)
  const lines = createInterface({ input: child.stdout })
  const pending = new Map<number, PendingRequest>()
  const routes = new Set<Route>()
  let nextId = 1
  let stderr = ''
  let failure: Error | undefined
  let disposed = false

  function rejectPending(error: Error, route?: Route) {
    for (const [id, request] of pending) {
      if (route && request.route !== route) continue
      clearTimeout(request.timer)
      pending.delete(id)
      request.reject(error)
    }
  }

  function fail(error: Error) {
    if (failure || disposed) return
    failure = error
    rejectPending(error)
    for (const route of [...routes]) route.onFailure(error)
  }

  const send = jsonLineWriter(child.stdin, fail, () => disposed || Boolean(failure))
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-4000) })
  child.on('error', fail)
  lines.on('error', fail)
  child.stderr.on('error', fail)
  child.once('exit', code => {
    void lifetime.wait(closeTimeoutMs).then(() => {
      const detail = stderr.trim()
      fail(new Error(`Codex App Server 异常退出（${code ?? 'unknown'}）${detail ? `：${detail}` : ''}`))
    })
  })

  lines.on('line', line => {
    let message: Message | undefined
    try { message = record(JSON.parse(line)) } catch { return }
    if (!message || failure || disposed) return
    const kind = classifyCodexAppServerMessage(message)
    if (kind === 'response') {
      if (typeof message.id !== 'number') return
      const request = pending.get(message.id)
      if (!request) return
      pending.delete(message.id)
      clearTimeout(request.timer)
      const error = record(message.error)
      if (error) request.reject(new Error(String(error.message || 'Codex App Server 请求失败')))
      else request.resolve(record(message.result) ?? {})
      return
    }
    if (kind === 'invalid') return
    const params = record(message.params)
    const threadId = params?.threadId ?? record(params?.thread)?.id ?? params?.conversationId
    const turnId = params?.turnId ?? record(params?.turn)?.id
    if (routing === 'shared' && kind === 'serverRequest' && message.method === 'currentTime/read' && threadId == null) {
      send({ id: message.id, result: { currentTimeAt: Math.floor(Date.now() / 1000) } })
      return
    }
    const matching = [...routes].filter(route => {
      if (routing === 'exclusive' && kind === 'notification') return true
      if (typeof threadId !== 'string' || route.threadId() !== threadId) return false
      if (turnId == null) return true
      const activeTurn = route.turnId()
      return activeTurn == null || activeTurn === turnId
    })
    const [route] = matching
    if (route && matching.length === 1) route.onMessage(message, kind)
    else if (kind === 'serverRequest') send({ id: message.id,
      error: { code: -32_601, message: 'Codex server request has no unique active thread owner' } })
  })

  return {
    lifetime,
    attach(route: Route) {
      if (disposed || failure) throw failure ?? new Error('Codex App Server 连接已关闭')
      if (routing === 'exclusive' && routes.size) throw new Error('Codex App Server 独占连接已有轮次')
      routes.add(route)
      return {
        send(message: Message) { if (routes.has(route)) send(message) },
        request(method: string, params: Message, timeoutMs: number): Promise<Message> {
          if (!routes.has(route) || failure) return Promise.reject(failure ?? new Error('Codex App Server 轮次已结束'))
          const id = nextId++
          return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
              pending.delete(id)
              reject(new CodexRpcTimeoutError(method, timeoutMs, method === 'initialize' ? 'initialize' : 'request'))
            }, timeoutMs)
            timer.unref?.()
            pending.set(id, { route, resolve, reject, timer })
            send({ method, id, params })
          })
        },
        detach(error = new Error('Codex App Server 轮次已结束')) {
          routes.delete(route)
          rejectPending(error, route)
        },
      }
    },
    dispose() {
      disposed = true
      routes.clear()
      rejectPending(new Error('Codex App Server 连接已关闭'))
      lifetime.drain(lines)
    },
  }
}
