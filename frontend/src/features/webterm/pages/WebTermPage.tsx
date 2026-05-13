import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Maximize2,
  Minimize2,
  PanelLeft,
  RefreshCw,
  RotateCcw,
  Settings2,
  TerminalSquare,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Terminal, type TerminalHandle } from '../components/Terminal'
import { AuxKeyBar } from '../components/AuxKeyBar'
import { MobileCommandInput } from '../components/MobileCommandInput'
import { ClaudeSessionList } from '../components/ClaudeSessionList'
import { useUpsertClaudeSession } from '../hooks/useClaudeSessions'
import type { ShellKind } from '../types'
import type { ClaudeSessionView } from '../api'

// 仅识别白名单 autorun token，避免 query 直接注入任意 shell 命令。
const AUTORUN_COMMANDS: Record<string, string> = {
  claude: 'claude',
  'claude-continue': 'claude --continue',
}

const QUICK_COMMANDS = [
  { label: 'Claude', cmd: 'claude\r', icon: <Sparkles className="size-3 text-amber-400" /> },
  { label: 'ls', cmd: 'ls\r' },
  { label: 'cd ..', cmd: 'cd ..\r' },
  { label: 'clear', cmd: 'clear\r' },
  { label: 'exit', cmd: 'exit\r' },
]

function resolveAutorun(token: string | null): string | null {
  if (!token) return null
  return AUTORUN_COMMANDS[token] ?? null
}

export function WebTermPage() {
  const [params] = useSearchParams()
  const queryCwd = params.get('cwd') ?? ''
  const queryAutorun = resolveAutorun(params.get('autorun'))

  const [shell, setShell] = useState<ShellKind>('powershell')
  const [cwd, setCwd] = useState<string>(queryCwd)
  const [autorun, setAutorun] = useState<string | null>(queryAutorun)
  const [attachSessionId, setAttachSessionId] = useState<string | null>(null)
  const [reconnectKey, setReconnectKey] = useState(0)
  const [state, setState] = useState<string>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [sessionsOpen, setSessionsOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 设置抽屉里的"草稿"shell / cwd —— 点了"应用并重连"才同步到 state，避免误改
  const [draftShell, setDraftShell] = useState<ShellKind>('powershell')
  const [draftCwd, setDraftCwd] = useState<string>(queryCwd)
  const rootRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<TerminalHandle>(null)

  // 用户手动改 cwd 后清掉 autorun，避免「改了路径还自动启动 claude」的意外组合
  useEffect(() => {
    if (autorun && cwd !== queryCwd) setAutorun(null)
  }, [cwd, autorun, queryCwd])

  // 进入 claude 时往后端登记一次（详细注释见 ClaudeSessionController）
  const upsert = useUpsertClaudeSession()
  useEffect(() => {
    if (!autorun || !autorun.startsWith('claude')) return
    const trimmed = cwd.trim()
    if (!trimmed) return
    upsert.mutate({ cwd: trimmed, shell })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autorun, reconnectKey])

  // 会话抽屉里点「接回 / 续接」：autorun 永远设成 claude --continue 作为 attach 失败兜底，
  // Terminal 内部按 socket.mode 判断到底是不是真的需要注入。
  const launchSession = (s: ClaudeSessionView) => {
    setErrorMsg(null)
    setShell(s.shell as ShellKind)
    setCwd(s.cwd)
    setAttachSessionId(s.liveSessionId)
    setAutorun('claude --continue')
    setReconnectKey(k => k + 1)
    setSessionsOpen(false)
  }

  const applySettings = () => {
    setErrorMsg(null)
    setShell(draftShell)
    setCwd(draftCwd)
    setAutorun(null)
    setAttachSessionId(null)
    setReconnectKey(k => k + 1)
    setSettingsOpen(false)
  }

  const handleReconnect = () => {
    setErrorMsg(null)
    setAutorun(null)
    setAttachSessionId(null)
    setReconnectKey(k => k + 1)
  }

  // 浏览器原生退出全屏（系统返回手势 / Esc）也能同步本地状态
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if (rootRef.current?.requestFullscreen) {
        await rootRef.current.requestFullscreen()
      }
    } catch {
      /* 浏览器拒绝时静默忽略 */
    }
  }

  const sendData = (data: string) => {
    terminalRef.current?.send(data)
  }

  return (
    <div
      ref={rootRef}
      className="relative flex h-[100dvh] min-h-0 flex-col bg-[#1a1b26] md:h-full"
    >
      {/* 顶部细工具栏 —— 终端永远占主体；表单 / 会话都收进抽屉里 */}
      <div className="flex items-center gap-1 border-b border-white/10 bg-[var(--color-card)] px-2 py-1.5 text-sm">
        <button
          type="button"
          onClick={() => setSessionsOpen(true)}
          className="inline-flex size-8 items-center justify-center rounded hover:bg-[var(--color-accent)]"
          title="Claude 会话"
          aria-label="打开 Claude 会话列表"
        >
          <PanelLeft className="size-4" />
        </button>

        <TerminalSquare className="size-3.5 text-[var(--color-muted-foreground)]" />
        <span className="truncate font-medium">终端</span>
        <span className="text-xs text-[var(--color-muted-foreground)]">· {state}</span>

        <span className="ml-auto" />

        <button
          type="button"
          onClick={() => terminalRef.current?.redraw()}
          className="inline-flex size-8 items-center justify-center rounded hover:bg-[var(--color-accent)]"
          title="重绘屏幕（xterm 与 claude TUI 状态对不齐时点这个）"
          aria-label="重绘终端"
        >
          <RefreshCw className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            setDraftShell(shell)
            setDraftCwd(cwd)
            setSettingsOpen(true)
          }}
          className="inline-flex size-8 items-center justify-center rounded hover:bg-[var(--color-accent)]"
          title="终端配置"
          aria-label="终端配置"
        >
          <Settings2 className="size-4" />
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="inline-flex size-8 items-center justify-center rounded hover:bg-[var(--color-accent)]"
          title={isFullscreen ? '退出全屏' : '进入全屏'}
          aria-label={isFullscreen ? '退出全屏' : '进入全屏'}
        >
          {isFullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
      </div>

      {errorMsg && (
        <div className="border-b border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-3 py-1.5 text-xs text-[var(--color-destructive)]">
          {errorMsg}
        </div>
      )}

      {/* 终端主体 —— flex-1 占满工具栏 + 辅助键栏之外的空间 */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <Terminal
          ref={terminalRef}
          key={reconnectKey + ':' + shell + ':' + cwd + ':' + (attachSessionId ?? '')}
          shell={shell}
          cwd={cwd || null}
          autorun={autorun}
          attachSessionId={attachSessionId}
          onStateChange={setState}
          onError={(code, message) => setErrorMsg(`${code}: ${message}`)}
        />
      </div>

      {/* 移动端辅助键 —— OS 软键盘上没有的 Esc/Tab/方向键/Ctrl+C/Ctrl+L */}
      <AuxKeyBar onSend={sendData} />

      {/* 移动端指令输入框 */}
      <MobileCommandInput onSend={sendData} quickCommands={QUICK_COMMANDS} />

      {/* 左抽屉：Claude 会话列表 */}
      <Sheet open={sessionsOpen} onOpenChange={setSessionsOpen}>
        <SheetContent side="left" className="flex w-[22rem] max-w-[88vw] flex-col p-0">
          <SheetTitle className="border-b px-4 py-3 text-base">Claude 会话</SheetTitle>
          <div className="flex-1 min-h-0">
            <ClaudeSessionList onLaunch={launchSession} />
          </div>
        </SheetContent>
      </Sheet>

      {/* 右抽屉：终端配置（Shell / cwd / 重连） */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent side="right" className="flex w-[22rem] max-w-[88vw] flex-col gap-4 p-4">
          <SheetTitle className="text-base">终端配置</SheetTitle>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[var(--color-muted-foreground)]">Shell</label>
            <div className="inline-flex overflow-hidden rounded-md border">
              <button
                type="button"
                onClick={() => setDraftShell('powershell')}
                className={`flex-1 px-3 py-1.5 text-sm transition-colors ${
                  draftShell === 'powershell'
                    ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                    : 'hover:bg-[var(--color-accent)]'
                }`}
              >
                PowerShell
              </button>
              <button
                type="button"
                onClick={() => setDraftShell('cmd')}
                className={`flex-1 border-l px-3 py-1.5 text-sm transition-colors ${
                  draftShell === 'cmd'
                    ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                    : 'hover:bg-[var(--color-accent)]'
                }`}
              >
                cmd
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[var(--color-muted-foreground)]">
              起始目录（留空 = 用户目录）
            </label>
            <Input
              value={draftCwd}
              onChange={e => setDraftCwd(e.target.value)}
              placeholder="C:\\Users\\..."
              className="font-mono text-sm"
            />
          </div>

          <div className="mt-2 flex flex-col gap-2">
            <Button onClick={applySettings}>
              <RotateCcw className="size-4" />
              应用并重连
            </Button>
            <Button variant="outline" onClick={() => { handleReconnect(); setSettingsOpen(false) }}>
              仅重连当前会话
            </Button>
          </div>

          <p className="mt-auto text-xs text-[var(--color-muted-foreground)]">
            基于 ConPTY + pty4j，行编辑、Tab 补全、方向键历史、Ctrl+C 中断与本地 PowerShell
            一致。
          </p>
        </SheetContent>
      </Sheet>
    </div>
  )
}
