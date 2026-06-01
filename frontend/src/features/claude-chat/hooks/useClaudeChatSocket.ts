import { useCallback, useEffect, useRef, useState } from 'react'
import type { Attachment, ChatItem, ClientMessage, ConnState, PendingRequest, ServerMessage } from '../types'

let _seq = 0
const nextId = () => `i${++_seq}`

/** 连接后要发出的首个意图（区分新建 / 续跑 / 重连回放）。 */
type Intent =
  | { kind: 'open'; cwd: string; model?: string }
  | { kind: 'switch'; sessionId: string }
  | { kind: 'resumeHistory'; sdkSessionId: string; cwd: string }
  | { kind: 'attach'; sessionId: string; lastEventSeq: number }

export interface UseClaudeChatSocket {
  state: ConnState
  sessionId: string | null
  items: ChatItem[]
  pending: PendingRequest | null
  running: boolean
  errorMessage: string | null
  /** 新建会话 */
  open: (cwd: string, model?: string) => void
  /** 切到工具内会话（resume 续跑） */
  switchTo: (sessionId: string) => void
  /** 续跑磁盘上的历史会话 */
  resumeHistory: (sdkSessionId: string, cwd: string) => void
  /** 下发一条用户消息（可带附件） */
  send: (text: string, attachments?: Attachment[]) => void
  /** 回灌权限/提问决策 */
  decide: (msg: Extract<ClientMessage, { type: 'decision' }>) => void
  interrupt: () => void
}

export function useClaudeChatSocket(): UseClaudeChatSocket {
  const [state, setState] = useState<ConnState>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [items, setItems] = useState<ChatItem[]>([])
  const [pending, setPending] = useState<PendingRequest | null>(null)
  const [running, setRunning] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const intentRef = useRef<Intent | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const lastSeqRef = useRef<number>(0)
  const manualCloseRef = useRef(false)

  const sendRaw = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
      return true
    }
    return false
  }, [])

  const applyEvent = useCallback((msg: ServerMessage) => {
    if (typeof msg.seq === 'number' && msg.seq > lastSeqRef.current) {
      lastSeqRef.current = msg.seq
    }
    switch (msg.type) {
      case 'ready':
        sessionIdRef.current = msg.sessionId
        setSessionId(msg.sessionId)
        setState('ready')
        break
      case 'assistantDelta':
        setItems(prev => {
          const last = prev[prev.length - 1]
          if (last && last.kind === 'assistant') {
            const copy = prev.slice(0, -1)
            return [...copy, { ...last, text: last.text + msg.text }]
          }
          return [...prev, { kind: 'assistant', id: nextId(), text: msg.text }]
        })
        break
      case 'toolUse':
        setItems(prev => [...prev, { kind: 'tool', id: nextId(), toolName: msg.toolName, input: msg.input }])
        break
      case 'toolResult':
        setItems(prev => {
          // 回填最近一个同名、尚无 output 的工具项
          for (let i = prev.length - 1; i >= 0; i--) {
            const it = prev[i]
            if (it.kind === 'tool' && it.toolName === msg.toolName && it.output === undefined) {
              const copy = prev.slice()
              copy[i] = { ...it, output: msg.output, isError: msg.isError }
              return copy
            }
          }
          return [...prev, { kind: 'tool', id: nextId(), toolName: msg.toolName, input: null, output: msg.output, isError: msg.isError }]
        })
        break
      case 'permissionRequest':
        setPending({ kind: 'permission', reqId: msg.reqId, toolName: msg.toolName, input: msg.input })
        break
      case 'questionRequest':
        setPending({ kind: 'question', reqId: msg.reqId, questions: msg.questions })
        break
      case 'result':
        setRunning(false)
        setItems(prev => [...prev, { kind: 'result', id: nextId(), stopReason: msg.stopReason }])
        break
      case 'error':
        setItems(prev => [...prev, { kind: 'error', id: nextId(), code: msg.code, message: msg.message }])
        if (msg.code === 'SIDECAR_DOWN') {
          setRunning(false)
          setErrorMessage(msg.message)
        }
        break
    }
  }, [])

  const flushIntent = useCallback(() => {
    const intent = intentRef.current
    if (!intent) return
    if (intent.kind === 'open') sendRaw({ type: 'open', cwd: intent.cwd, model: intent.model })
    else if (intent.kind === 'switch') sendRaw({ type: 'switchSession', sessionId: intent.sessionId })
    else if (intent.kind === 'resumeHistory') sendRaw({ type: 'resumeHistory', sdkSessionId: intent.sdkSessionId, cwd: intent.cwd })
    else sendRaw({ type: 'attach', sessionId: intent.sessionId, lastEventSeq: intent.lastEventSeq })
  }, [sendRaw])

  const connect = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/api/claude-chat/ws`
    setState('connecting')
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => flushIntent()
    ws.onmessage = ev => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      applyEvent(msg)
    }
    ws.onerror = () => {
      setState('error')
      setErrorMessage('WebSocket 连接出错')
    }
    ws.onclose = () => {
      wsRef.current = null
      if (manualCloseRef.current) return
      // 非主动关闭且已有会话：自动重连并 attach 回放（断连不丢消息）
      if (sessionIdRef.current) {
        intentRef.current = { kind: 'attach', sessionId: sessionIdRef.current, lastEventSeq: lastSeqRef.current }
        setState('closed')
        setTimeout(() => connect(), 1000)
      } else {
        setState('closed')
      }
    }
  }, [applyEvent, flushIntent])

  useEffect(() => {
    manualCloseRef.current = false
    connect()
    return () => {
      manualCloseRef.current = true
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  const resetForNewSession = () => {
    setItems([])
    setPending(null)
    setRunning(false)
    setErrorMessage(null)
    lastSeqRef.current = 0
  }

  const open = useCallback((cwd: string, model?: string) => {
    resetForNewSession()
    sessionIdRef.current = null
    setSessionId(null)
    intentRef.current = { kind: 'open', cwd, model }
    if (!sendRaw({ type: 'open', cwd, model })) connect()
  }, [sendRaw, connect])

  const switchTo = useCallback((sid: string) => {
    resetForNewSession()
    sessionIdRef.current = sid
    setSessionId(sid)
    intentRef.current = { kind: 'switch', sessionId: sid }
    if (!sendRaw({ type: 'switchSession', sessionId: sid })) connect()
  }, [sendRaw, connect])

  const resumeHistory = useCallback((sdkSessionId: string, cwd: string) => {
    resetForNewSession()
    // 服务端会为该历史会话建一条新元数据行，sessionId 由 ready 事件回填
    sessionIdRef.current = null
    setSessionId(null)
    intentRef.current = { kind: 'resumeHistory', sdkSessionId, cwd }
    if (!sendRaw({ type: 'resumeHistory', sdkSessionId, cwd })) connect()
  }, [sendRaw, connect])

  const send = useCallback((text: string, attachments?: Attachment[]) => {
    const t = text.trim()
    const hasAtt = !!attachments && attachments.length > 0
    if (!t && !hasAtt) return
    setItems(prev => [...prev, { kind: 'user', id: nextId(), text: t }])
    setRunning(true)
    sendRaw({ type: 'send', text: t, attachments: hasAtt ? attachments : undefined })
  }, [sendRaw])

  const decide = useCallback((msg: Extract<ClientMessage, { type: 'decision' }>) => {
    setPending(null)
    sendRaw(msg)
  }, [sendRaw])

  const interrupt = useCallback(() => {
    sendRaw({ type: 'interrupt' })
    setRunning(false)
  }, [sendRaw])

  return { state, sessionId, items, pending, running, errorMessage, open, switchTo, resumeHistory, send, decide, interrupt }
}
