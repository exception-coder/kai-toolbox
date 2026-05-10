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
      // PTY 模式下 PowerShell 自己输出完整 \r\n，xterm 不能再做 \n→\r\n 转换，
      // 否则会变 \r\r\n 让光标定位错乱，命令执行完需多按一次回车才出新提示符。
      convertEol: false,
      scrollback: 5000,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)

    termRef.current = term
    fitRef.current = fit

    const tryFit = () => {
      const el = containerRef.current
      if (!el) return false
      const { clientWidth, clientHeight } = el
      if (clientWidth < 10 || clientHeight < 10) return false
      try {
        fit.fit()
        const next = { cols: term.cols, rows: term.rows }
        if (Number.isFinite(next.cols) && Number.isFinite(next.rows) && next.cols > 0 && next.rows > 0) {
          setSize(prev => (prev.cols !== next.cols || prev.rows !== next.rows ? next : prev))
          return true
        }
      } catch {
        /* ignore */
      }
      return false
    }

    // 等下一帧让浏览器先完成 layout 再 fit，避免 RenderService 拿到 0×0
    const raf = requestAnimationFrame(() => {
      tryFit()
      setEnabled(true)
    })

    const ro = new ResizeObserver(() => {
      tryFit()
    })
    ro.observe(containerRef.current)

    return () => {
      cancelAnimationFrame(raf)
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

  // Wire xterm input → socket. 不做本地 echo：
  // PowerShell / cmd 自己会把按键回写到 stdout，前端再 echo 一次会双倍显示，
  // 还会把 \x7f / \x1b[D 等控制字节直接喂给 xterm，导致解析报错和光标越界。
  useEffect(() => {
    const term = termRef.current
    if (!term) return
    const sub = term.onData(data => {
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
