import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { zcodeCommand, type ZCodeTurnContext } from './zcodeEngine.js'

type Json = Record<string, unknown>
function record(value: unknown): Json {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}
}

/** Native app-server exposes an empty tool allowlist, which the ordinary CLI prompt does not. */
export async function runZCodeReview(ctx: ZCodeTurnContext, launch: typeof spawn = spawn): Promise<void> {
  const native = zcodeCommand()
  const child = launch(native.command, [...native.prefix, 'app-server', '--stdio'], {
    cwd: ctx.cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  })
  const pending = new Map<number, { method: string; resolve(value: Json): void; reject(error: Error): void }>()
  let sequence = 0, buffer = '', failure: Error | undefined
  const fail = (error: Error) => { failure = error; for (const call of pending.values()) call.reject(error); pending.clear() }
  const closed = new Promise<void>(resolve => child.once('close', () => { fail(new Error('ZCode 评审进程已关闭')); resolve() }))
  child.once('error', error => fail(error))
  child.stdin.on('error', error => fail(error))
  child.stderr.resume()
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk
    if (buffer.length > 2 * 1024 * 1024) { fail(new Error('ZCode 协议响应过大')); child.kill(); return }
    let end: number
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1)
      if (!line.trim()) continue
      try {
        const response = record(JSON.parse(line))
        if (typeof response.method === 'string' && response.id !== undefined) {
          const result = response.method === 'session/requestRuntimePreferences'
            ? { nativeSearchEnhancementsEnabled: false, toolSearchMode: 'off', memoryEnabled: false,
              appControlEnabled: false, subagentRuntimeConfigEnabled: false, askUserQuestionAutoResolutionEnabled: false }
            : undefined
          child.stdin.write(JSON.stringify(result ? { id: response.id, result }
            : { id: response.id, error: { code: -32601, message: 'Host capability is unavailable in text review' } }) + '\n')
          continue
        }
        if (typeof response.id !== 'number') continue
        const call = pending.get(response.id)
        if (!call) continue
        pending.delete(response.id)
        if (response.error) call.reject(new Error(`ZCode 评审 ${call.method} 请求失败（${record(response.error).code}）`))
        else call.resolve(record(response.result))
      } catch { fail(new Error('ZCode 原生评审协议不兼容')); child.kill() }
    }
  })
  const abort = () => { fail(new Error('ZCode 评审已取消')); child.kill() }
  ctx.signal.addEventListener('abort', abort, { once: true })
  const rpc = async (method: string, params: Json): Promise<Json> => {
    ctx.signal.throwIfAborted()
    if (failure) throw failure
    const id = ++sequence
    let timer: NodeJS.Timeout | undefined
    try {
      return await new Promise<Json>((resolve, reject) => {
        pending.set(id, { method, resolve, reject })
        timer = setTimeout(() => { pending.delete(id); reject(new Error('ZCode 评审协议超时')) }, 30_000)
        child.stdin.write(JSON.stringify({ id, method, params }) + '\n')
      })
    } finally { clearTimeout(timer) }
  }
  try {
    const created = await rpc('session/create', { workspace: { workspacePath: ctx.cwd, workspaceKey: ctx.cwd },
      mode: 'plan', toolAllowlist: [], mcpServers: [], dynamicWorkflowEnabled: false, offPeakToolEnabled: false,
      titleGenerationEnabled: false })
    const sessionId = record(created.session).sessionId
    if (typeof sessionId !== 'string') throw new Error('ZCode 未返回评审会话身份')
    ctx.setSdkSessionId(sessionId)
    const revision = record(created.runtime).stateRevision
    if (typeof revision !== 'number') throw new Error('ZCode 缺少原生会话版本')
    await rpc('session/send', { sessionId, content: ctx.text, expectedRevision: revision })
    let afterSeq = 0
    while (true) {
      const response = await rpc('session/events', { sessionId, afterSeq, limit: 500 })
      if (!Array.isArray(response.events)) throw new Error('ZCode 缺少评审事件')
      for (const rawEvent of response.events) {
        const event = record(rawEvent)
        if (event.sessionId !== sessionId || typeof event.seq !== 'number') throw new Error('ZCode 评审事件身份不匹配')
        afterSeq = Math.max(afterSeq, event.seq)
        const payload = record(event.payload)
        if (event.type === 'model.streaming' && payload.kind === 'text_delta' && typeof payload.delta === 'string') ctx.emit({ type: 'assistantDelta', text: payload.delta })
        if (['tool.updated', 'permission.requested', 'turn.failed'].includes(String(event.type))) throw new Error('ZCode 文字评审未完整完成')
        if (event.type === 'turn.completed') {
          if (payload.resultType !== 'success' || payload.toolCallCount !== 0 || typeof payload.response !== 'string') throw new Error('ZCode 评审未成功结束')
          ctx.emit({ type: 'assistantSnapshot', text: payload.response })
          ctx.emit({ type: 'result', stopReason: 'end_turn', usage: {} })
          return
        }
      }
      await delay(250, undefined, { signal: ctx.signal })
    }
  } finally {
    ctx.signal.removeEventListener('abort', abort)
    child.stdin.end()
    child.kill()
    await Promise.race([closed, delay(3000)])
  }
}
