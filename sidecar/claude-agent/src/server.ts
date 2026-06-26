import { WebSocketServer, type WebSocket } from 'ws'
import { SessionManager } from './sessionManager.js'

const port = Number(process.env.CLAUDE_CHAT_SIDECAR_PORT) || 18890

// 仅绑 127.0.0.1：sidecar 不对外暴露，只有本机 Java 后端能连。
const wss = new WebSocketServer({ host: '127.0.0.1', port })

// 单 Java 后端：保留最近一条连接，事件都发给它。
let active: WebSocket | null = null

const emit = (sessionId: string, event: Record<string, unknown>): void => {
  if (active && active.readyState === active.OPEN) {
    active.send(JSON.stringify({ ...event, sessionId }))
  }
}

const manager = new SessionManager(emit)

wss.on('connection', (ws) => {
  active = ws
  console.log('[sidecar] Java backend connected')

  ws.on('message', (data) => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }
    const type = msg.type as string
    const sessionId = msg.sessionId as string
    switch (type) {
      case 'start':
        manager.start(sessionId, msg.cwd as string, msg.model as string, msg.mode as string, msg.engine as string, msg.apiBaseUrl as string | undefined, msg.authToken as string | undefined,
          msg.demo as boolean | undefined, msg.demoApiBase as string | undefined)
        break
      case 'setMode':
        manager.setMode(sessionId, msg.mode as string)
        break
      case 'setModel':
        manager.setModel(sessionId, msg.model as string)
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
        void manager.forkSession(sessionId, msg.upToMessageId as string)
        break
      case 'resume':
        manager.resume(sessionId, msg.sdkSessionId as string, msg.cwd as string, msg.engine as string, msg.apiBaseUrl as string | undefined, msg.authToken as string | undefined)
        break
      case 'user':
        manager.user(sessionId, msg.text as string)
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
        break
      case 'oneShot':
        void manager.oneShot(sessionId, msg.systemPrompt as string, msg.userPrompt as string, msg.model as string)
        break
      default:
        console.warn('[sidecar] unknown message type:', type)
    }
  })

  ws.on('close', () => {
    if (active === ws) active = null
    console.log('[sidecar] Java backend disconnected')
  })
})

wss.on('listening', () => {
  console.log(`[sidecar] listening on 127.0.0.1:${port}`)
})
