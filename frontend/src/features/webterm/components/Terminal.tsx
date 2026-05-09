import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useWebTermSocket } from '../hooks/useWebTermSocket'
import type { ShellKind } from '../types'

interface TerminalProps {
  shell: ShellKind
  cwd?: string | null
  onStateChange?: (state: string) => void
  onError?: (code: string, message: string) => void
}

export function Terminal({ shell, cwd, onStateChange, onError }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<XTerm | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const [size, setSize] = useState<{ cols: number; rows: number }>({ cols: 120, rows: 30 })
  const [enabled, setEnabled] = useState(false)

  // Mount xterm once
  useEffect(() => {
    if (!containerRef.current) return
    const term = new XTerm({
      cursorBlink: true,
      fontFamily: 'Consolas, "Cascadia Mono", "JetBrains Mono", Menlo, monospace',
      fontSize: 13,
      theme: {
        background: '#1a1b26',
        foreground: '#c0caf5',
        cursor: '#c0caf5',
      },
      convertEol: true,
      scrollback: 5000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    try {
      fit.fit()
    } catch {
      /* container may still be 0×0 in tests */
    }

    termRef.current = term
    fitRef.current = fit

    setSize({ cols: term.cols, rows: term.rows })
    setEnabled(true)

    const ro = new ResizeObserver(() => {
      try {
        fit.fit()
        const next = { cols: term.cols, rows: term.rows }
        setSize(prev => (prev.cols !== next.cols || prev.rows !== next.rows ? next : prev))
      } catch {
        /* ignore */
      }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [])

  const socket = useWebTermSocket({
    enabled,
    shell,
    cwd,
    initialCols: size.cols,
    initialRows: size.rows,
    onReady: () => {
      termRef.current?.focus()
    },
    onOutput: data => {
      termRef.current?.write(data)
    },
    onExit: code => {
      termRef.current?.writeln(`\r\n\x1b[33m[会话已结束 exit=${code}]\x1b[0m`)
    },
    onError: (code, message) => {
      onError?.(code, message)
      termRef.current?.writeln(`\r\n\x1b[31m[错误 ${code}] ${message}\x1b[0m`)
    },
  })

  // Wire xterm input → socket (with local echo to compensate no-PTY)
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    const sub = term.onData(data => {
      term.write(data)
      socket.send(data)
    })
    return () => sub.dispose()
  }, [socket])

  // Notify size changes upstream
  useEffect(() => {
    if (socket.state === 'ready') {
      socket.resize(size.cols, size.rows)
    }
  }, [size, socket])

  // Bubble state out
  useEffect(() => {
    onStateChange?.(socket.state)
  }, [socket.state, onStateChange])

  return (
    <div
      ref={containerRef}
      className="h-full w-full rounded-md bg-[#1a1b26] p-2"
      style={{ minHeight: 320 }}
    />
  )
}
