import { useCallback, useEffect, useRef, useState } from 'react'
import { getToken } from '@/lib/auth'
import type { ClientMessage, ServerMessage, ShellKind, SocketState } from '../types'

export interface UseWebTermSocketOptions {
  enabled: boolean
  shell: ShellKind
  cwd?: string | null
  initialCols: number
  initialRows: number
  /** 非空 = 先 attach 到这个 PTY 会话；attach 失败（SESSION_NOT_FOUND / SESSION_BUSY）
   *  会静默回退到 open 新开一个 PTY，不需要调用方做 fallback 逻辑。 */
  attachSessionId?: string | null
  onReady?: (msg: Extract<ServerMessage, { type: 'ready' }>) => void
  onOutput?: (data: string) => void
  onExit?: (code: number) => void
  onError?: (code: string, message: string) => void
}

export interface WebTermSocket {
  state: SocketState
  errorMessage: string | null
  send: (data: string) => void
  resize: (cols: number, rows: number) => void
  close: () => void
  /** 当前连上去的模式：成功 attach 到旧 PTY ⇒ 'attach'；新开了一条 ⇒ 'open'。
   *  attach 失败 fallback 走 open 的场景里，这个值最终会是 'open'，调用方
   *  根据它决定要不要注入 autorun 命令。未连上时是 null。 */
  mode: 'attach' | 'open' | null
}

export function useWebTermSocket(opts: UseWebTermSocketOptions): WebTermSocket {
  const { enabled, shell, cwd, initialCols, initialRows, attachSessionId,
          onReady, onOutput, onExit, onError } = opts

  const [state, setState] = useState<SocketState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [attemptAttach, setAttemptAttach] = useState(true) // 第一次允许 attach，attach 失败转 false 重试 open
  const [mode, setMode] = useState<'attach' | 'open' | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  // Keep latest callbacks without re-creating the socket on every render
  const cbRef = useRef({ onReady, onOutput, onExit, onError })
  cbRef.current = { onReady, onOutput, onExit, onError }

  const sendRaw = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }, [])

  // 后端对 cols/rows 有 [20-500, 5-200] 的硬限制；移动端容器被压得很扁时 xterm
  // fit 可能算出 rows=3、cols=15 之类，连接会被拒（INVALID_SIZE）。这里统一在
  // 发送前 clamp，宁可 PTY 视野略大于可见区，也别因为一次 fit 抖动断连。
  const clampCols = (c: number) => Math.max(20, Math.min(500, Math.floor(c) || 20))
  const clampRows = (r: number) => Math.max(5, Math.min(200, Math.floor(r) || 5))

  const send = useCallback((data: string) => sendRaw({ type: 'input', data }), [sendRaw])
  const resize = useCallback(
    (cols: number, rows: number) =>
      sendRaw({ type: 'resize', cols: clampCols(cols), rows: clampRows(rows) }),
    [sendRaw]
  )
  const close = useCallback(() => {
    sendRaw({ type: 'close' })
    wsRef.current?.close()
  }, [sendRaw])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    // WS 握手无法带 Authorization 头，开启鉴权后用 access_token 查询参数让 AdminHandshakeInterceptor 校验。
    const token = getToken()
    const qs = token ? `?access_token=${encodeURIComponent(token)}` : ''
    const url = `${proto}//${window.location.host}/api/webterm/ws${qs}`
    setState('connecting')
    setErrorMessage(null)
    const ws = new WebSocket(url)
    wsRef.current = ws

    const willAttach = !!attachSessionId && attemptAttach
    const safeCols = clampCols(initialCols)
    const safeRows = clampRows(initialRows)
    ws.onopen = () => {
      setState('opening')
      setMode(willAttach ? 'attach' : 'open')
      const first: ClientMessage = willAttach
        ? { type: 'attach', sessionId: attachSessionId!, cols: safeCols, rows: safeRows }
        : { type: 'open', shell, cwd: cwd ?? null, cols: safeCols, rows: safeRows }
      ws.send(JSON.stringify(first))
    }

    ws.onmessage = ev => {
      let msg: ServerMessage
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      switch (msg.type) {
        case 'ready':
          setState('ready')
          // 服务端识别为「接回已有 PTY」（attach 或 open 自动复用）时把本地 mode
          // 修正为 attach，让 Terminal 跳过 autorun 注入，避免对 claude 重复打命令。
          if (msg.reused) setMode('attach')
          cbRef.current.onReady?.(msg)
          break
        case 'output':
          cbRef.current.onOutput?.(msg.data)
          break
        case 'exit':
          cbRef.current.onExit?.(msg.code)
          setState('closed')
          break
        case 'error':
          // attach 失败时（PTY 已被回收 / 被别人占用）静默 fallback 到 open：
          // 关闭当前 ws，把 attemptAttach 设为 false，effect 重新跑会以 open 模式连上。
          if (willAttach && (msg.code === 'SESSION_NOT_FOUND' || msg.code === 'SESSION_BUSY')) {
            try { ws.close() } catch { /* noop */ }
            setAttemptAttach(false)
            return
          }
          cbRef.current.onError?.(msg.code, msg.message)
          setErrorMessage(`${msg.code}: ${msg.message}`)
          setState('error')
          break
      }
    }

    ws.onclose = () => {
      setState(prev => (prev === 'error' ? prev : 'closed'))
    }

    ws.onerror = () => {
      setState('error')
      setErrorMessage('WebSocket 连接出错')
    }

    return () => {
      try { ws.close() } catch { /* noop */ }
      wsRef.current = null
    }
    // shell/cwd 变化时由父级 key 重置整个组件触发新连接；
    // attemptAttach 切回 false 时让 effect 重跑一次走 open 路径作为 fallback。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, attemptAttach])

  return { state, errorMessage, send, resize, close, mode }
}
