import { WebSocketServer, type WebSocket } from 'ws'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { SessionManager } from './sessionManager.js'
import { AgentTracing } from './telemetry/agentTracing.js'
import { initializeTelemetry, shutdownTelemetry } from './telemetry/telemetry.js'

const port = Number(process.env.CLAUDE_CHAT_SIDECAR_PORT) || 18890
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

// 仅绑 127.0.0.1：sidecar 不对外暴露，只有本机 Java 后端能连。
const wss = new WebSocketServer({ host: '127.0.0.1', port })

// 事件广播给所有存活的 Java 连接。同一时刻可能不止一条：后端热重启后旧 context 的客户端
// 还没断、或误起了第二个后端。若只发「最近一条」，事件就可能发给一个已经不服务浏览器的那端，
// 表现为前端永远收不到回复 —— 这里宁可多发（本机、按 sessionId 路由，重复投递无副作用）。
const clients = new Set<WebSocket>()

const emit = (sessionId: string, event: Record<string, unknown>): void => {
  const observed = agentTracing.observe(sessionId, event)
  const payload = JSON.stringify({ ...observed, sessionId })
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(payload)
    }
  }
}

const manager = new SessionManager(emit)

// 是否已成功监听。监听建立【前】的致命错误（尤其 EADDRINUSE：端口已被另一个 sidecar 占用）绝不能被
// 兜住变成「活着但没监听」的僵尸——那会打乱后端「spawn 失败→退出→回落连到已有实例」的自愈，导致
// 事件收不到、前端永久「思考中」。此类必须退出；退出后后端会连到已有监听实例（或重新拉起）。
let listening = false

// 端口占用：已有 sidecar 在跑，本冗余实例干净退出（0），让后端连到既有监听者。
wss.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[sidecar] 端口 ${port} 已被占用（已有 sidecar 在运行），本实例退出`)
    process.exit(0)
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
      case 'resume':
        manager.resume(sessionId, msg.sdkSessionId as string, msg.cwd as string, msg.engine as string, msg.apiBaseUrl as string | undefined, msg.authToken as string | undefined,
          msg.codexHome as string | undefined, msg.mode as string | undefined, msg.autoApprove as boolean | undefined,
          msg.model as string | undefined, msg.codexReasoningEffort as string | undefined, msg.codexSpeed as string | undefined,
          msg.toolPolicy as string | undefined,
          Array.isArray(msg.consultEvidenceSystems) ? msg.consultEvidenceSystems.filter((value): value is string => typeof value === 'string') : [])
        break
      case 'user':
        agentTracing.begin(sessionId, msg.traceContext, msg.telemetry)
        manager.user(sessionId, msg.text as string, msg.developerInstructions as string | undefined)
        break
      case 'decision':
        manager.decide(sessionId, msg.reqId as string, {
          behavior: msg.behavior as string,
          updatedInput: msg.updatedInput,
          answers: msg.answers as Record<string, unknown> | undefined,
        })
        break
      case 'interrupt':
        manager.interrupt(sessionId)
        agentTracing.finishSession(sessionId, 'interrupted')
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
        emit(sessionId, { type: 'error', code: 'SIDECAR_DISPATCH_ERROR', message: e instanceof Error ? e.message : String(e) })
        emit(sessionId, { type: 'result', usage: {}, stopReason: 'error' })
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

let stopping = false
const gracefulStop = (signal: string): void => {
  if (stopping) return
  stopping = true
  agentTracing.finishAll(signal)
  void shutdownTelemetry().finally(() => process.exit(0))
}
process.once('SIGTERM', () => gracefulStop('SIGTERM'))
process.once('SIGINT', () => gracefulStop('SIGINT'))
