export const SESSION_CLIENT_PROTOCOL_VERSION = '1.0'

export type GrantStatus = 'ACTIVE' | 'PAUSED' | 'REVOKED' | 'EXPIRED'

export interface SessionClientOptions {
  requestBaseUrl: string
  /** 直连 Forge 时提供；服务端 Relay 模式通常沿用宿主 Cookie，可省略。 */
  getAccessToken?: () => string | Promise<string>
  /** 默认为 Forge 直连接口；Relay 模式可设为 /api/forge-session-relay/v1。 */
  apiPath?: string
  fetch?: typeof globalThis.fetch
  WebSocket?: typeof globalThis.WebSocket
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
  reconnect?: { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number }
}

export interface PublicSession {
  sessionId: string
  title?: string
  status: string
  profile: 'DELEGATED_DEVELOPMENT' | 'REQUEST_ONLY'
  grantStatus: GrantStatus
  expiresAt: string
  maxTurns: number
  usedTurns: number
  maxInputBytes: number
  sessionVersion: number
  progress?: {
    state?: string
    phase?: string
    currentTaskId?: string
    completedTasks: number
    totalTasks: number
  }
}

export interface PublicMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp?: number
}

export interface SessionClientEvent<T = unknown> {
  protocolVersion: string
  type: 'ready' | 'message' | 'commandAccepted' | 'progress' | 'businessQuestion'
    | 'completed' | 'blocked' | 'replayGap' | 'error'
  eventId?: string
  seq: number
  sessionVersion: number
  occurredAt: string
  data?: T
  error?: { code: string; message: string; retryable: boolean }
}

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'offline' | 'terminal'

export interface SessionClient {
  connect(): Promise<PublicSession>
  send(input: { text: string; attachments?: Array<{ id: string; name: string; mime: string }> }): Promise<string>
  answerQuestion(requestId: string, answers: Record<string, unknown>): Promise<string>
  interrupt(): Promise<string>
  upload(file: File): Promise<{ id: string; name: string; mime: string; size: number }>
  loadHistory(before?: number, limit?: number): Promise<{ items: PublicMessage[]; nextBefore?: number; transcriptMissing: boolean }>
  subscribe(listener: (event: SessionClientEvent) => void): () => void
  subscribeState(listener: (state: ConnectionState) => void): () => void
  destroy(): void
}
