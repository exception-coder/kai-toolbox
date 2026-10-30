import { WebSocketServer, type WebSocket } from 'ws'
import fs from 'node:fs'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { SessionManager } from './sessionManager.js'
import { AgentTracing } from './telemetry/agentTracing.js'
import { initializeTelemetry, shutdownTelemetry } from './telemetry/telemetry.js'
import { EngineCatalog } from './engine/engineCatalog.js'
import { readCodexSubscriptionQuota } from './codexSubscriptionQuota.js'
import { inspectConsultAccount } from './consultAccountProbe.js'
import { readCodexDesktopPage } from './codexDesktopSync.js'
import {
  createGraphifyRuntimeRequestHandler,
  GraphifyRuntime,
  GRAPHIFY_RUNTIME_TOKEN,
} from './graphifyRuntime.js'
import { inspectSystemRoute } from './codexSecurity.js'
import { prepareCodexVoice, reconnectCodexVoice, controlCodexVoice, type CodexVoiceOffer } from './codexRealtime.js'
import { watchParentLifetime, stopWithinDeadline } from './parentLifetime.js'
import { QueueReceipts, queueCheckOutcome } from './queueReceipts.js'

const port = Number(process.env.CLAUDE_CHAT_SIDECAR_PORT) || 18890
const queueReceipts = new QueueReceipts(path.join(os.homedir(), '.kai-toolbox', `queue-receipts-${port}.json`))
initializeTelemetry()
const agentTracing = new AgentTracing()

// pid 文件：后端重启拉新 sidecar 前据此精确杀掉仍占端口的旧实例，避免连到旧代码孤儿进程。
const pidFile = path.join(os.homedir(), '.kai-toolbox', 'claude-sidecar.pid')
const writePidFile = (): void => {
  try {
    fs.mkdirSync(path.dirname(pidFile), { recursive: true })
    fs.writeFileSync(pidFile, String(process.pid), 'utf8')
  } catch (e) {
    console.error('[sidecar] 写 pid 文件失败（忽略）:', e)
  }
}
const clearPidFile = (): void => {
  try {
    // 仅当文件内容确为本进程 pid 才删，避免删掉后继实例写的新 pid。
    if (fs.existsSync(pidFile) && fs.readFileSync(pidFile, 'utf8').trim() === String(process.pid)) {
      fs.rmSync(pidFile, { force: true })
    }
  } catch {
    // 忽略
  }
}
process.on('exit', clearPidFile)

// 仅绑 127.0.0.1：WebSocket 与内部 Graphify API 共用一个监听端口，不额外暴露服务。
const graphifyRuntime = new GraphifyRuntime()
const httpServer = createServer(createGraphifyRuntimeRequestHandler(graphifyRuntime, GRAPHIFY_RUNTIME_TOKEN))
const wss = new WebSocketServer({ server: httpServer })

// 事件广播给所有存活的 Java 连接。同一时刻可能不止一条：后端热重启后旧 context 的客户端
// 还没断、或误起了第二个后端。若只发「最近一条」，事件就可能发给一个已经不服务浏览器的那端，
// 表现为前端永远收不到回复 —— 这里宁可多发（本机、按 sessionId 路由，重复投递无副作用）。
const clients = new Set<WebSocket>()

const queueChecks = new Map<string, { turnId: string; tail: string }>()

const emit = (sessionId: string, event: Record<string, unknown>): void => {
  const check = queueChecks.get(sessionId)
  if (check && event.turnId === check.turnId) {
    if (event.type === 'assistantDelta') check.tail = (check.tail + String(event.text ?? '')).slice(-2048)
    if (event.type === 'assistantSnapshot') check.tail = String(event.text ?? '').slice(-2048)
    if (event.type === 'result') {
      event = { ...event, queueCheckOutcome: queueCheckOutcome(check.tail, check.turnId) }
      queueChecks.delete(sessionId)
    }
  }
  if (event.type === 'result') {
    try { queueReceipts.complete(sessionId, event) }
    catch (error) {
      console.error('[sidecar] 队列终态持久化失败，禁止自动续发:', error)
      event = { ...event, queueReleaseSafe: false }
      emit(sessionId, { type: 'warning', turnId: event.turnId, code: 'QUEUE_RECEIPT_FAILED',
        message: '完成回执保存失败，后续队列已暂停；请检查磁盘后核对结果。' })
    }
  }
  const observed = agentTracing.observe(sessionId, event)
  const payload = JSON.stringify({ ...observed, sessionId, queueReceiptProtocol: 1, queueReceiptStoreId: queueReceipts.storeId })
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload)
    }
  }
}

const engineCatalog = new EngineCatalog()
const manager = new SessionManager(emit, engineCatalog)
void engineCatalog.list(true).then(entries => {
  const summary = entries.map(entry => `${entry.id}:${entry.probe.status}`).join(', ')
  console.log(`[sidecar] engine catalog ready ${summary}`)
}).catch(error => {
  console.error('[sidecar] engine catalog warmup failed:', error)
})

// 监听建立前的致命错误必须退出，不能留下活着但无法提供服务的进程。
let listening = false

// 端口占用属于启动失败，不能将未知监听者冒充本 JVM 所属的运行时。
httpServer.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[sidecar] 端口 ${port} 已被占用，拒绝沿用归属未知的监听者，本实例退出`)
    process.exit(1)
  }
  console.error('[sidecar] WebSocketServer 致命错误，退出:', err)
  process.exit(1)
})

// 进程级兜底：sidecar 是多会话共用的单进程，监听建立【后】任一会话/某一轮里逃逸的异常都绝不能把
// 整个进程带崩（否则所有会话一起 SIDECAR_DOWN、进行中的工具调用全丢），只记日志、保活。
// 但监听建立【前】的未捕获异常（启动失败）必须退出，不能兜成僵尸。
process.on('uncaughtException', (err) => {
  if (!listening) {
    console.error('[sidecar] 监听建立前未捕获异常，退出:', err)
    process.exit(1)
  }
  console.error('[sidecar] uncaughtException（已兜住，进程存活）:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[sidecar] unhandledRejection（已兜住，进程存活）:', reason)
})

wss.on('connection', (ws) => {
  clients.add(ws)
  console.log(`[sidecar] Java backend connected（当前 ${clients.size} 条）`)

  ws.on('message', (data) => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }
    const type = msg.type as string
    const sessionId = msg.sessionId as string
    try {
    switch (type) {
      case 'voicePrepare':
        prepareCodexVoice(sessionId, msg.offer as unknown as CodexVoiceOffer, event => emit(sessionId, event))
        break
      case 'voiceReconnect':
        void reconnectCodexVoice(sessionId, msg.offer as unknown as CodexVoiceOffer, event => emit(sessionId, event))
        break
      case 'voiceControl':
        void controlCodexVoice(sessionId, String(msg.callId), String(msg.action))
        break
      case 'start':
        manager.start(sessionId, msg.cwd as string, msg.model as string, msg.mode as string, msg.engine as string, msg.apiBaseUrl as string | undefined, msg.authToken as string | undefined,
          msg.codexHome as string | undefined, msg.demo as boolean | undefined, msg.demoApiBase as string | undefined, msg.autoApprove as boolean | undefined,
          msg.codexReasoningEffort as string | undefined, msg.codexSpeed as string | undefined, msg.toolPolicy as string | undefined,
          Array.isArray(msg.consultEvidenceSystems) ? msg.consultEvidenceSystems.filter((value): value is string => typeof value === 'string') : [])
        break
      case 'setMode':
        manager.setMode(sessionId, msg.mode as string)
        break
      case 'setAutoApprove':
        manager.setAutoApprove(sessionId, msg.autoApprove === true)
        break
      case 'setModel':
        manager.setModel(sessionId, msg.model as string)
        break
      case 'refreshModels':
        void manager.refreshModels(sessionId ?? null)
        break
      case 'refreshCapabilities':
        manager.refreshCapabilities(sessionId)
        break
      case 'setCodexOptions':
        manager.setCodexOptions(sessionId, msg.reasoningEffort as string, msg.speed as string)
        break
      case 'switchEngine':
        manager.switchEngine(
          sessionId,
          msg.engine as string,
          msg.sdkSessionId as string | undefined,
          msg.apiBaseUrl as string | undefined,
          msg.authToken as string | undefined,
        )
        break
      case 'switchProvider':
        manager.switchProvider(
          sessionId,
          msg.apiBaseUrl as string | undefined,
          msg.authToken as string | undefined,
        )
        break
      case 'forkSession':
        void manager.forkSession(sessionId, msg.upToMessageId as string | undefined)
        break
      case 'forkReviewThread':
        void manager.forkReviewThread(
          msg.sourceThreadId as string,
          (msg.lastTurnId as string | undefined) || undefined,
          (msg.codexHome as string | undefined) || undefined,
        ).then(sdkSessionId => emit('review-fork', {
          type: 'reviewForked', requestId: msg.requestId, sdkSessionId,
        })).catch(error => emit('review-fork', {
          type: 'reviewForked', requestId: msg.requestId,
          error: error instanceof Error ? error.message : String(error),
        }))
        break
      case 'resume':
        manager.resume(sessionId, msg.sdkSessionId as string, msg.cwd as string, msg.engine as string, msg.apiBaseUrl as string | undefined, msg.authToken as string | undefined,
          msg.codexHome as string | undefined, msg.mode as string | undefined, msg.autoApprove as boolean | undefined,
          msg.model as string | undefined, msg.codexReasoningEffort as string | undefined, msg.codexSpeed as string | undefined,
          msg.toolPolicy as string | undefined,
          Array.isArray(msg.consultEvidenceSystems) ? msg.consultEvidenceSystems.filter((value): value is string => typeof value === 'string') : [])
        break
      case 'user':
        if (typeof msg.turnId === 'string' && msg.turnId) {
          const receipt = queueReceipts.find(sessionId, msg.turnId)
          if (receipt) {
            emit(sessionId, { type: 'turnAccepted', turnId: msg.turnId })
            if (receipt.state === 'COMPLETED') emit(sessionId, { type: 'result', turnId: msg.turnId,
              stopReason: receipt.stopReason, queueReleaseSafe: receipt.queueReleaseSafe, queueCheckOutcome: receipt.queueCheckOutcome, usage: {} })
            break
          }
          const state = manager.runtimeState(sessionId)
          if (!state.sessionPresent || state.active || state.pendingDecision || state.backgroundTaskCount > 0) {
            emit(sessionId, { type: 'error', turnId: msg.turnId, code: 'QUEUE_ADMISSION_REJECTED', message: '引擎会话未就绪或仍忙碌，未接收新的轮次' })
            break
          }
          queueReceipts.receive(sessionId, msg.turnId)
          if (msg.queueCheck === true) queueChecks.set(sessionId, { turnId: msg.turnId, tail: '' })
          emit(sessionId, { type: 'turnAccepted', turnId: msg.turnId })
        }
        if (msg.consultAccount) manager.configureConsultAccount(sessionId, msg.consultAccount)
        agentTracing.begin(sessionId, msg.traceContext, msg.telemetry)
        manager.user(
          sessionId,
          msg.text as string,
          msg.developerInstructions as string | undefined,
          msg.sessionContext as string | undefined,
          Array.isArray(msg.additionalDirectories)
            ? msg.additionalDirectories.filter((value): value is string => typeof value === 'string')
            : [],
          msg.turnId as string | undefined,
          msg.images as import('./sessionManager.js').OneShotImage[] | undefined,
          msg.turnToolPolicy as string | undefined,
          msg.consultToolAssembly,
          msg.voiceCallId as string | undefined,
        )
        break
      case 'steer':
        void manager.steer(sessionId, msg.text as string)
        break
      case 'decision':
        manager.decide(sessionId, msg.reqId as string, {
          behavior: msg.behavior as string,
          updatedInput: msg.updatedInput,
          answers: msg.answers as Record<string, unknown> | undefined,
        })
        break
      case 'interrupt':
        emit(sessionId, {
          type: 'interruptAck',
          turnId: msg.turnId as string | undefined,
          ...manager.interrupt(sessionId, msg.turnId as string | undefined),
        })
        agentTracing.finishSession(sessionId, 'interrupted')
        break
      case 'queryTurnState':
        emit(sessionId, {
          type: 'turnState',
          turnId: msg.turnId as string | undefined,
          ...manager.turnState(sessionId, msg.turnId as string | undefined),
        })
        break
      case 'querySessionState':
        emit(sessionId, {
          type: 'sessionState',
          requestId: msg.requestId as string | undefined,
          ...manager.runtimeState(sessionId, msg.turnId as string | undefined),
          receipt: queueReceipts.find(sessionId, msg.turnId as string | undefined),
        })
        break
      case 'querySubscriptionQuota':
        void readCodexSubscriptionQuota(
          typeof msg.codexHome === 'string' ? msg.codexHome : undefined,
          typeof msg.model === 'string' ? msg.model : undefined,
        ).then(quota => emit('subscription-quota', {
          type: 'subscriptionQuota', requestId: msg.requestId, quota,
        }))
        break
      case 'inspectConsultAccount':
        void inspectConsultAccount(String(msg.codexHome ?? ''), String(msg.model ?? '')).then(result =>
          emit('consult-account-inspection', { type: 'consultAccountInspection', requestId: msg.requestId, ...result }))
        break
      case 'queryCodexDesktop':
        void readCodexDesktopPage(
          typeof msg.codexHome === 'string' ? msg.codexHome : '',
          msg.kind as 'projects' | 'threads',
          typeof msg.cursor === 'string' ? msg.cursor : undefined,
          typeof msg.projectId === 'string' ? msg.projectId : undefined,
        ).then(page => emit('codex-desktop-sync', {
          type: 'codexDesktopPage', requestId: msg.requestId, page,
        })).catch(() => emit('codex-desktop-sync', {
          type: 'codexDesktopPage', requestId: msg.requestId,
          error: '无法读取 Codex 本机目录，请检查授权目录、CLI 版本及 App Server 可用性后重试',
        }))
        break
      case 'queryEngineCatalog':
        void engineCatalog.list(msg.refresh === true).then(entries => emit('engine-catalog', {
          type: 'engineCatalog',
          requestId: msg.requestId as string | undefined,
          protocolVersion: 1,
          engines: entries,
        })).catch(error => emit('engine-catalog', {
          type: 'engineCatalog',
          requestId: msg.requestId as string | undefined,
          protocolVersion: 1,
          engines: [],
          error: error instanceof Error ? error.message : String(error),
        }))
        break
      case 'inspectSystemRoute':
        emit('system-route-inspection', {
          type: 'systemRouteInspection',
          requestId: msg.requestId as string | undefined,
          ...inspectSystemRoute(
            msg.cwd as string | undefined,
            Array.isArray(msg.evidenceSystems)
              ? msg.evidenceSystems.filter((value): value is string => typeof value === 'string')
              : [],
          ),
        })
        break
      case 'oneShot':
        agentTracing.begin(sessionId, msg.traceContext, msg.telemetry)
        void manager.oneShot(
          sessionId,
          msg.systemPrompt as string,
          msg.userPrompt as string,
          msg.model as string,
          msg.engine as string,
          msg.images as import('./sessionManager.js').OneShotImage[] | undefined,
          {
            cwd: msg.cwd as string | undefined,
            reasoningEffort: msg.reasoningEffort as string | undefined,
            speed: msg.speed as string | undefined,
            apiBaseUrl: msg.apiBaseUrl as string | undefined,
            authToken: msg.authToken as string | undefined,
            codexHome: msg.codexHome as string | undefined,
            toolPolicy: msg.toolPolicy as string | undefined,
          },
        )
        break
      default:
        console.warn('[sidecar] unknown message type:', type)
    }
    } catch (e) {
      // 同步分发异常兜底：不让一条消息的处理异常冒泡到 ws 监听器（会触发进程崩溃）。
      console.error('[sidecar] 处理消息异常（已兜住）type=' + type + ':', e)
      if (sessionId) {
        const correlation = typeof msg.turnId === 'string' ? { turnId: msg.turnId } : {}
        emit(sessionId, { type: 'error', ...correlation, code: msg.consultAccount ? 'CONSULT_ACCOUNT_PREPARATION_FAILED' : 'SIDECAR_DISPATCH_ERROR', message: e instanceof Error ? e.message : String(e) })
        emit(sessionId, { type: 'result', ...correlation, usage: {}, stopReason: 'error' })
      }
    }
  })

  ws.on('close', () => {
    clients.delete(ws)
    console.log(`[sidecar] Java backend disconnected（剩余 ${clients.size} 条）`)
  })
})

wss.on('listening', () => {
  listening = true
  writePidFile()
  console.log(`[sidecar] listening on 127.0.0.1:${port}`)
})

httpServer.listen(port, '127.0.0.1')

let stopping = false
const gracefulStop = (signal: string): void => {
  if (stopping) return
  stopping = true
  stopWithinDeadline(async () => {
    // Release the listener before asynchronous exporters/runtime cleanup.
    for (const client of clients) client.terminate()
    wss.close()
    httpServer.close()
    console.log(`[sidecar] stopping: ${signal}`)
    agentTracing.finishAll(signal)
    await Promise.allSettled([graphifyRuntime.close(signal), shutdownTelemetry()])
  }, code => process.exit(code))
}
process.once('SIGTERM', () => gracefulStop('SIGTERM'))
process.once('SIGINT', () => gracefulStop('SIGINT'))
if (process.env.KAI_SIDECAR_PARENT_PID === String(process.ppid)) {
  watchParentLifetime(process.stdin, gracefulStop, [process.stdout, process.stderr])
}
