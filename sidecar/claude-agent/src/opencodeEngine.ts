import { existsSync } from 'node:fs'
import { createOpencode, type Event, type OpencodeClient, type Part } from '@opencode-ai/sdk'

/**
 * OpenCode 引擎：把 opencode（多 provider 的 agent）接成一种引擎，专供第三方 API 模型使用。
 *
 * <p>与把别家模型硬塞进 Claude 引擎不同——opencode 自带 provider-agnostic 的 agent 循环，
 * gpt/gemini/deepseek 等行为正常（不会乱用 Claude 专有的计划模式）。provider/鉴权由 opencode
 * 自己管理（用户 `opencode auth login` 或 opencode.json 配置），本引擎只负责选模型、发消息、转事件。
 *
 * <p>架构：单进程内只起一个 opencode server + 一条全局事件流（SSE），按 sessionID 路由到各会话的
 * emit。事件→统一协议映射：message.part.updated(text.delta)→assistantDelta；tool state→toolUse/toolResult；
 * session.prompt 阻塞到本轮结束→result。
 */
export interface OpencodeTurnCtx {
  text: string
  cwd: string
  /** 形如 "providerID/modelID"（如 openai/gpt-4o、anthropic/claude-3-5-sonnet）；无 "/" 或空则用 opencode 默认模型。 */
  model?: string
  /** 已有 opencode 会话 id（续跑）；无则新建。 */
  sdkSessionId?: string
  signal: AbortSignal
  emit: (e: Record<string, unknown>) => void
  setSdkSessionId: (id: string) => void
}

/** 单个会话本轮的事件聚合状态。 */
interface Handler {
  emit: (e: Record<string, unknown>) => void
  assistant: Set<string>   // assistant 消息 id（区分助手文本 vs 用户回显）
  toolUse: Set<string>     // 已 emit toolUse 的 callID
  toolDone: Set<string>    // 已 emit toolResult 的 callID
  lastText: Map<string, string> // partID -> 已发文本（无 delta 时按增量回退）
  responseModel?: string   // API 实际返回的模型（providerID/modelID）
}

let clientPromise: Promise<OpencodeClient> | null = null
const handlers = new Map<string, Handler>() // opencode sessionID -> Handler

/** 懒启动 opencode server + client，并起一条常驻全局事件流。失败抛错由调用方兜。 */
async function ensureClient(): Promise<OpencodeClient> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { client } = await createOpencode({ hostname: '127.0.0.1' })
      startEventLoop(client)
      console.log('[sidecar] opencode server 已启动')
      return client
    })().catch((e) => {
      clientPromise = null // 失败可重试
      throw e
    })
  }
  return clientPromise
}

/** 全局事件流：断开自动重连；按 sessionID 路由到对应 Handler。 */
function startEventLoop(client: OpencodeClient): void {
  void (async () => {
    for (;;) {
      try {
        const events = await client.event.subscribe()
        for await (const ev of events.stream as AsyncIterable<Event>) {
          try { dispatch(ev) } catch { /* 单事件异常不拖垮整条流 */ }
        }
      } catch (e) {
        console.warn('[sidecar] opencode 事件流断开，2s 后重连：', e instanceof Error ? e.message : String(e))
      }
      await delay(2000)
    }
  })()
}

function dispatch(ev: Event): void {
  if (ev.type === 'message.updated') {
    const info = ev.properties.info
    const h = handlers.get(info.sessionID)
    if (!h) return
    if (info.role === 'assistant') {
      h.assistant.add(info.id)
      if (info.providerID && info.modelID) h.responseModel = `${info.providerID}/${info.modelID}`
    }
    return
  }
  if (ev.type === 'message.part.updated') {
    const part = ev.properties.part
    const h = handlers.get(part.sessionID)
    if (h) handlePart(h, part, ev.properties.delta)
    return
  }
  if (ev.type === 'session.error') {
    const sid = ev.properties.sessionID
    const h = sid ? handlers.get(sid) : undefined
    if (h) h.emit({ type: 'error', code: 'OPENCODE_ERROR', message: stringifyError(ev.properties.error) })
  }
}

function handlePart(h: Handler, part: Part, delta: string | undefined): void {
  if (part.type === 'text') {
    // assistant 流式文本带 delta；用户 prompt 回显无 delta，故按 delta 存在性区分，避免把用户输入当助手回复回吐
    if (typeof delta === 'string' && delta.length > 0) {
      h.emit({ type: 'assistantDelta', text: delta })
      h.lastText.set(part.id, part.text ?? '')
    } else if (h.assistant.has(part.messageID) && typeof part.text === 'string') {
      const prev = h.lastText.get(part.id) ?? ''
      if (part.text.length > prev.length) {
        h.emit({ type: 'assistantDelta', text: part.text.slice(prev.length) })
        h.lastText.set(part.id, part.text)
      }
    }
    return
  }
  if (part.type === 'tool') {
    const st = part.state
    const emitUse = () => {
      if (h.toolUse.has(part.callID)) return
      h.toolUse.add(part.callID)
      h.emit({ type: 'toolUse', toolName: part.tool, input: 'input' in st ? st.input : null })
    }
    if (st.status === 'running' || st.status === 'pending') {
      emitUse()
    } else if (st.status === 'completed' && !h.toolDone.has(part.callID)) {
      emitUse()
      h.toolDone.add(part.callID)
      h.emit({ type: 'toolResult', toolName: part.tool, output: truncate(st.output ?? ''), isError: false })
    } else if (st.status === 'error' && !h.toolDone.has(part.callID)) {
      emitUse()
      h.toolDone.add(part.callID)
      h.emit({ type: 'toolResult', toolName: part.tool, output: st.error ?? '工具执行失败', isError: true })
    }
  }
}

/** 跑一轮 opencode：建/续会话 → prompt（阻塞到本轮结束）→ 转事件 + 收尾。 */
export async function runOpencodeTurn(ctx: OpencodeTurnCtx): Promise<void> {
  let client: OpencodeClient
  try {
    client = await ensureClient()
  } catch (e) {
    ctx.emit({
      type: 'error', code: 'OPENCODE_DOWN',
      message: 'opencode 启动失败：' + (e instanceof Error ? e.message : String(e))
        + '（确认已安装 opencode 并配置好 provider：opencode auth login）',
    })
    return
  }

  const dir = existsSync(ctx.cwd) ? ctx.cwd : undefined
  const query = dir ? { directory: dir } : undefined

  let sid = ctx.sdkSessionId
  if (!sid) {
    const created = await client.session.create({ body: {}, query })
    sid = created.data?.id
    if (!sid) { ctx.emit({ type: 'error', code: 'OPENCODE_ERROR', message: '创建 opencode 会话失败' }); return }
    ctx.setSdkSessionId(sid)
    ctx.emit({ type: 'init', sdkSessionId: sid })
  }

  const h: Handler = { emit: ctx.emit, assistant: new Set(), toolUse: new Set(), toolDone: new Set(), lastText: new Map() }
  handlers.set(sid, h)
  const sessionId = sid
  const onAbort = () => { void client.session.abort({ path: { id: sessionId }, query }).catch(() => {}) }
  ctx.signal.addEventListener('abort', onAbort)

  const model = parseModel(ctx.model)
  try {
    const res = await client.session.prompt({
      path: { id: sessionId },
      query,
      body: {
        ...(model ? { model } : {}),
        parts: [{ type: 'text', text: ctx.text }],
      },
    })
    if (res.error) {
      ctx.emit({ type: 'error', code: 'OPENCODE_ERROR', message: stringifyError(res.error) })
      return
    }
    const info = res.data?.info
    if (info?.providerID && info?.modelID) h.responseModel = `${info.providerID}/${info.modelID}`
    console.log(`[sidecar] opencode turn done session=${sessionId} requested=${ctx.model ?? '默认'} responded=${h.responseModel ?? '?'}`)
    ctx.emit({ type: 'turnInfo', requestedModel: ctx.model ?? null, responseModel: h.responseModel ?? null, viaGateway: false, baseUrl: null })
    ctx.emit({ type: 'result', usage: {}, stopReason: 'end_turn' })
  } catch (e) {
    if (ctx.signal.aborted) { ctx.emit({ type: 'result', usage: {}, stopReason: 'interrupted' }); return }
    ctx.emit({ type: 'error', code: 'OPENCODE_QUERY_FAILED', message: e instanceof Error ? e.message : String(e) })
  } finally {
    ctx.signal.removeEventListener('abort', onAbort)
    handlers.delete(sessionId)
  }
}

/** "providerID/modelID" → {providerID, modelID}；无 "/" 前缀则返回 undefined（交给 opencode 默认模型）。 */
function parseModel(m?: string): { providerID: string; modelID: string } | undefined {
  if (!m) return undefined
  const i = m.indexOf('/')
  if (i <= 0 || i >= m.length - 1) return undefined
  return { providerID: m.slice(0, i), modelID: m.slice(i + 1) }
}

function stringifyError(err: unknown): string {
  if (err == null) return 'opencode 错误'
  if (typeof err === 'string') return err
  const o = err as Record<string, unknown>
  if (typeof o.message === 'string') return o.message
  if (o.data && typeof (o.data as Record<string, unknown>).message === 'string') return (o.data as Record<string, unknown>).message as string
  try { return JSON.stringify(err) } catch { return String(err) }
}

function truncate(s: string, max = 4000): string {
  return s.length > max ? s.slice(0, max) + '…(truncated)' : s
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
