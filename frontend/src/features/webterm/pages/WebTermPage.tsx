import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Maximize2, Minimize2, RotateCcw, TerminalSquare } from 'lucide-react'
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
  const [isFullscreen, setIsFullscreen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // 用户手动改 cwd 输入框后清掉 autorun，避免「改了路径还自动启动 claude」的意外组合
  useEffect(() => {
    if (autorun && cwd !== queryCwd) {
      setAutorun(null)
    }
  }, [cwd, autorun, queryCwd])

  const handleReconnect = () => {
    setErrorMsg(null)
    setAutorun(null)
    setReconnectKey(k => k + 1)
  }

  // 监听 fullscreenchange，浏览器原生退出（系统返回手势 / Esc 键）也能同步状态
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // requestFullscreen 必须在 user gesture 处理器里同步发起，所以直接绑在按钮 onClick；
  // 对 WebTermPage 的根 div 调 requestFullscreen，TopBar / Sidebar / 浏览器地址栏一起隐去，
  // WebTermPage 独占整屏，避开 visualViewport 在不同浏览器表现不一致带来的兼容性坑。
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if (rootRef.current?.requestFullscreen) {
        await rootRef.current.requestFullscreen()
      }
    } catch {
      /* 浏览器拒绝（旧 iOS Safari 等不支持 Fullscreen API）时静默忽略 */
    }
  }

  // 移动端用 VirtualKeyboard 完全替代系统键盘，所以不再有"软键盘弹起"事件；
  // 表单收起的唯一信号是用户主动点了"全屏"。
  const compact = isFullscreen

  return (
    <div
      ref={rootRef}
      className={`relative flex h-full min-h-0 flex-col gap-3 bg-[var(--color-background)] ${
        compact ? 'p-0' : 'p-4'
      }`}
    >
      {/* 移动端浮动「全屏 / 退出」按钮：始终可见，不依赖 Card 是否收起。
          桌面端 hover 也能用，但桌面端不易点错且 keyboard 事件不会触发，因此用 md:hidden 隐藏。*/}
      <button
        type="button"
        onClick={toggleFullscreen}
        className="absolute right-2 top-2 z-50 inline-flex items-center gap-1 rounded-md bg-black/60 px-3 py-1.5 text-xs text-white shadow active:bg-black/75 md:hidden"
        aria-label={isFullscreen ? '退出全屏' : '进入全屏'}
      >
        {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
        {isFullscreen ? '退出' : '全屏'}
      </button>

      {/* 全屏模式下整个表单收起，让终端独占可见区。
          桌面端默认不进全屏，compact 永远是 false，Card 始终显示。*/}
      <Card className={compact ? 'hidden' : undefined}>
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
          compact ? '' : 'rounded-md border'
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

      {!compact && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          提示：基于 ConPTY + pty4j，行编辑、Tab 补全、方向键历史、Ctrl+C 中断与本地 PowerShell 一致；进程僵死时点「重新连接」即可强制重启。
        </p>
      )}
    </div>
  )
}
