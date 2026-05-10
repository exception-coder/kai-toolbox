import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RotateCcw, TerminalSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Terminal } from '../components/Terminal'
import type { ShellKind } from '../types'

// 仅识别白名单 autorun 命令，避免 query 注入任意 shell 命令
const AUTORUN_WHITELIST = new Set(['claude'])

export function WebTermPage() {
  const [params] = useSearchParams()
  const queryCwd = params.get('cwd') ?? ''
  const rawAutorun = params.get('autorun')
  const queryAutorun = rawAutorun && AUTORUN_WHITELIST.has(rawAutorun) ? rawAutorun : null

  const [shell, setShell] = useState<ShellKind>('powershell')
  const [cwd, setCwd] = useState<string>(queryCwd)
  const [autorun, setAutorun] = useState<string | null>(queryAutorun)
  const [reconnectKey, setReconnectKey] = useState(0)
  const [state, setState] = useState<string>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [keyboardOpen, setKeyboardOpen] = useState(false)

  // 用户手动改 cwd 输入框后清掉 autorun，避免「改了路径还自动启动 claude」的意外组合
  useEffect(() => {
    if (autorun && cwd !== queryCwd) {
      setAutorun(null)
    }
  }, [cwd, autorun, queryCwd])

  // 仅用来跟踪软键盘是否弹出（决定要不要隐藏底部提示语）。
  // 真正"让 layout 适配键盘高度"的逻辑下沉到了 AppShell：把整个 shell 的高度
  // 直接绑到 window.visualViewport.height，从而避免浏览器为了"露出"焦点输入框
  // 而触发的 main 自动滚动 —— 之前那个滚动会和我们手动改 height 互相打架，
  // 导致页面错位、终端区一片空白。
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const apply = () => {
      const kbHeight = Math.max(0, window.innerHeight - vv.height)
      setKeyboardOpen(kbHeight > 120)
    }
    apply()
    vv.addEventListener('resize', apply)
    return () => vv.removeEventListener('resize', apply)
  }, [])

  const handleReconnect = () => {
    setErrorMsg(null)
    setAutorun(null)
    setReconnectKey(k => k + 1)
  }

  return (
    <div
      className={`flex h-full min-h-0 flex-col gap-3 ${
        keyboardOpen ? 'p-0' : 'p-4'
      }`}
    >
      {/* 软键盘弹起后整个表单收起，让终端独占可见区。
          桌面端不会有软键盘事件，所以 keyboardOpen 永远是 false，Card 始终显示。*/}
      <Card className={keyboardOpen ? 'hidden' : undefined}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TerminalSquare className="size-4" />
            Web 终端
            <span className="ml-auto text-xs font-normal text-[var(--color-muted-foreground)]">
              状态：{state}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--color-muted-foreground)]">Shell</label>
            <div className="inline-flex overflow-hidden rounded-md border">
              <button
                type="button"
                onClick={() => setShell('powershell')}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  shell === 'powershell'
                    ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                    : 'hover:bg-[var(--color-accent)]'
                }`}
              >
                PowerShell
              </button>
              <button
                type="button"
                onClick={() => setShell('cmd')}
                className={`border-l px-3 py-1.5 text-sm transition-colors ${
                  shell === 'cmd'
                    ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                    : 'hover:bg-[var(--color-accent)]'
                }`}
              >
                cmd
              </button>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-1 min-w-[260px]">
            <label className="text-xs text-[var(--color-muted-foreground)]">
              起始目录（留空 = 用户目录）
            </label>
            <Input
              value={cwd}
              onChange={e => setCwd(e.target.value)}
              placeholder="C:\\Users\\..."
              className="font-mono text-sm"
            />
          </div>

          <Button onClick={handleReconnect} variant="outline">
            <RotateCcw />
            重新连接
          </Button>
        </CardContent>
      </Card>

      {errorMsg && (
        <div className="rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]">
          {errorMsg}
        </div>
      )}

      <div
        className={`flex-1 min-h-0 overflow-hidden bg-[#1a1b26] ${
          keyboardOpen ? '' : 'rounded-md border'
        }`}
      >
        <Terminal
          key={reconnectKey + ':' + shell + ':' + cwd}
          shell={shell}
          cwd={cwd || null}
          autorun={autorun}
          onStateChange={setState}
          onError={(code, message) => setErrorMsg(`${code}: ${message}`)}
        />
      </div>

      {!keyboardOpen && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          提示：基于 ConPTY + pty4j，行编辑、Tab 补全、方向键历史、Ctrl+C 中断与本地 PowerShell 一致；进程僵死时点「重新连接」即可强制重启。
        </p>
      )}
    </div>
  )
}
