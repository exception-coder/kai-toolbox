import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { useWebTermSocket } from '../hooks/useWebTermSocket'
import type { ShellKind } from '../types'

export interface TerminalHandle {
  /** 兜底：清掉 xterm 内部状态 + 触发一次 SIGWINCH，让 TUI 程序（claude 等）重绘。 */
  redraw: () => void
  /** 给外层（辅助键 / 命令面板等）一条直接把字节灌进 PTY 的路径。 */
  send: (data: string) => void
}

interface TerminalProps {
  shell: ShellKind
  cwd?: string | null
  /** 进入 ready 后向终端追发的字面量命令（白名单内），如 'claude'。null 表示不注入。
   *  attachSessionId 非空时本字段被忽略（claude 已经在跑了，不能再注入）。 */
  autorun?: string | null
  /** 非空 = attach 到这个存活的 PTY 会话；走 attach 时不注入 autorun。 */
  attachSessionId?: string | null
  onStateChange?: (state: string) => void
  onError?: (code: string, message: string) => void
}

export const Terminal = forwardRef<TerminalHandle, TerminalProps>(function Terminal(
  { shell, cwd, autorun, attachSessionId, onStateChange, onError },
  ref,
) {
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
      // 告诉 xterm 后端是 ConPTY，它会按 ConPTY 的输出风格解析 ANSI 序列；
      // 不加这个选项，Claude Code / vim / nano 等 TUI 程序的局部重绘会丢帧、
      // 选项菜单要按一次回车才"重画"出来。
      windowsPty: { backend: 'conpty', buildNumber: 19041 },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)

    // 渲染器：桌面端走 WebGL（TUI 程序局部重绘帧率更好、文字更锐利）；触屏设备
    // 走默认 DOM renderer ——
    // 实测移动 GPU 上 WebGL renderer 处理 alt-screen 切换、DECSC/DECRC（光标保存/
    // 恢复）这类 ANSI 私有序列时会抖动，导致 Claude Code 这类 Ink-based TUI 出现
    // 光标错位、输入定位到错误行的现象。DOM renderer 帧率低但状态可靠。
    const isCoarsePointer =
      typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
    if (!isCoarsePointer) {
      try {
        const webgl = new WebglAddon()
        webgl.onContextLoss(() => webgl.dispose())
        term.loadAddon(webgl)
      } catch {
        /* WebGL 不可用时静默走 DOM renderer，功能不受影响 */
      }
    }

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
    attachSessionId,
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

  // ready 后追发 autorun 命令。延后 80ms 让 PowerShell 把 PS1 提示符渲染完，
  // 否则注入命令会与提示符粘连，视觉略丑。一个 Terminal 实例只 ready 一次，
  // 因此本 effect 至多触发一次实际 send。
  // socket.mode === 'attach' 表示真的接回到了旧 PTY（claude 已经在跑），
  // 此时不能再注入 autorun 否则会重复执行命令；attach 失败 fallback 走 open 时
  // mode 会变成 'open'，那种情况就要注入 autorun（典型场景：PTY 已过期回收，
  // 这里得自己启动一个新 claude --continue 续上对话历史）。
  useEffect(() => {
    if (socket.state !== 'ready' || !autorun) return
    if (socket.mode === 'attach') return
    const t = setTimeout(() => socket.send(autorun + '\r\n'), 80)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket.state, socket.mode])

  useImperativeHandle(ref, () => ({
    redraw: () => {
      // 1) reset 清掉 xterm 内部 ANSI 状态机（alt-screen / 已保存光标 / 颜色态）；
      // 2) 用「先 +1 再恢复」的 resize 序列触发 PTY 的 SIGWINCH，强迫 claude 等
      //    TUI 程序按当前实际尺寸重画整张屏 —— 用于 attach 后 backlog 回放与 claude
      //    本身的 alt-screen 状态对不齐、出现光标错位时兜底。
      try { termRef.current?.reset() } catch { /* ignore */ }
      const cur = size
      socket.resize(cur.cols + 1, cur.rows)
      setTimeout(() => socket.resize(cur.cols, cur.rows), 30)
    },
    send: (data: string) => socket.send(data),
  }), [socket, size])

  // 移动端用户点终端区域 → xterm 内部 focus 隐藏的 textarea → OS 键盘弹起，
  // 输入直接通过 term.onData 流到 PTY，不走我们这层中转，消除"虚拟输入条
  // 与 OS 键盘衔接错位"那类问题。
  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-[#1a1b26] p-2"
      onClick={() => termRef.current?.focus()}
    />
  )
})
