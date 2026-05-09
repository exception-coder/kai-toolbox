import { useCallback, useEffect, useRef, useState } from 'react'
import type { ClientMessage, ServerMessage, ShellKind, SocketState } from '../types'

export interface UseWebTermSocketOptions {
  enabled: boolean
  shell: ShellKind
  cwd?: string | null
  initialCols: number
  initialRows: number
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
}

export function useWebTermSocket(opts: UseWebTermSocketOptions): WebTermSocket {
  const { enabled, shell, cwd, initialCols, initialRows, onReady, onOutput, onExit, onError } = opts

  const [state, setState] = useState<SocketState>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
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

  const send = useCallback((data: string) => sendRaw({ type: 'input', data }), [sendRaw])
  const resize = useCallback(
    (cols: number, rows: number) => sendRaw({ type: 'resize', cols, rows }),
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
    const url = `${proto}//${window.location.host}/api/webterm/ws`
    setState('connecting')
    setErrorMessage(null)
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setState('opening')
      const open: ClientMessage = {
        type: 'open',
        shell,
        cwd: cwd ?? null,
        cols: initialCols,
        rows: initialRows,
      }
      ws.send(JSON.stringify(open))
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
    // shell/cwd 变化时由父级 key 重置整个组件触发新连接
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  return { state, errorMessage, send, resize, close }
}
