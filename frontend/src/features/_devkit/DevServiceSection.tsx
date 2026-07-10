import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Loader2, Maximize2, Play, RotateCw, ScrollText, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  devServiceLogStream, getDevServiceStatus, startDevService, stopDevService, restartDevService,
  type DevServiceStatus,
} from './devServiceApi'

interface Props {
  /** 项目/服务 id，一个 id 一条进程 + 一条日志流（如 'erp'、'kai-toolbox'）。 */
  serviceId: string
  /** 可选项目目录列表（拍平的工作区一级目录）。 */
  dirs: { path: string; label: string }[]
  /** 默认选中的项目目录（通常跟随上方表单的选择）。 */
  defaultCwd: string
  /** 启动命令默认值（命令框留空时用它，在所选目录下执行）。 */
  defaultCommand: string
  /** 命令输入框占位提示。 */
  commandPlaceholder?: string
  /** 区块标题。 */
  title?: string
  /** 停服命令（可选，留空=结束进程树）。 */
  stopCommand?: string
}

/**
 * 通用「服务启停 + 前台启动日志」区：在工作台直接起停某项目服务并实时看控制台日志（SSE + 放大浮层），
 * 也用于自闭环验证「改完重启让改动生效」。**只能起停/读取本工作台拉起的服务**。
 * 是各「XX 需求开发」模块共用的组件，由脚手架生成的模块直接引用。
 */
export function DevServiceSection({
  serviceId, dirs, defaultCwd, defaultCommand,
  commandPlaceholder, title = '服务启停 + 启动日志', stopCommand,
}: Props) {
  const CMD_KEY = `kai-toolbox:dev:start-cmd:${serviceId}`
  const [cwd, setCwd] = useState(defaultCwd)
  const [command, setCommand] = useState(() => {
    try { return localStorage.getItem(CMD_KEY) ?? '' } catch { return '' }
  })
  const [status, setStatus] = useState<DevServiceStatus | null>(null)
  const [lines, setLines] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const bigLogRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (defaultCwd) setCwd(defaultCwd) }, [defaultCwd])

  useEffect(() => { getDevServiceStatus(serviceId).then(setStatus).catch(() => {}) }, [serviceId])

  // SSE 实时日志/状态：连上即回放缓冲,故每次 open 先清空避免重连重复
  useEffect(() => {
    const es = new EventSource(devServiceLogStream(serviceId))
    es.onopen = () => setLines([])
    const onLine = (e: Event) => setLines(prev => [...prev.slice(-1999), (e as MessageEvent).data as string])
    es.addEventListener('log', onLine)
    es.addEventListener('exit', onLine)
    es.addEventListener('status', e => { try { setStatus(JSON.parse((e as MessageEvent).data)) } catch { /* ignore */ } })
    return () => es.close()
  }, [serviceId])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
    if (bigLogRef.current) bigLogRef.current.scrollTop = bigLogRef.current.scrollHeight
  }, [lines, expanded])

  useEffect(() => {
    if (!expanded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [expanded])

  const running = !!status?.running
  const effCommand = command.trim() || defaultCommand
  const setCmd = (v: string) => { setCommand(v); try { localStorage.setItem(CMD_KEY, v) } catch { /* ignore */ } }
  const applyResult = (r: DevServiceStatus | { ok: false; error: string }) => {
    if (r && typeof r === 'object' && 'ok' in r && r.ok === false) setMsg(`失败：${r.error}`)
    else { setStatus(r as DevServiceStatus); setMsg(null) }
  }
  const onErr = (e: unknown) => setMsg(`失败：${e instanceof Error ? e.message : '未知'}`)

  const start = useMutation({ mutationFn: () => startDevService(serviceId, cwd, effCommand), onSuccess: applyResult, onError: onErr })
  const stop = useMutation({ mutationFn: () => stopDevService(serviceId, stopCommand), onSuccess: applyResult, onError: onErr })
  const restart = useMutation({ mutationFn: () => restartDevService(serviceId, cwd, effCommand, stopCommand), onSuccess: applyResult, onError: onErr })
  const busy = start.isPending || stop.isPending || restart.isPending

  const renderLog = () => lines.length === 0
    ? <div className="text-[#64748b]">暂无日志。点「启动」拉起服务后，这里实时显示前台控制台输出。</div>
    : lines.map((l, i) => <div key={i} className="whitespace-pre-wrap break-all">{l}</div>)

  return (
    <details className="mt-4 rounded-xl border bg-[var(--color-card)] p-4" open>
      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <ScrollText className="size-4 text-[var(--color-primary)]" />
        {title}
        {running
          ? <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">运行中 · pid {status?.pid}</span>
          : <span className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">已停止</span>}
      </summary>
      <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
        由工作台托管拉起服务并实时读<b>前台启动日志</b>；用于自闭环验证「改完重启让改动生效」。
        只能起停/读取<b>本工作台拉起</b>的服务。停服默认结束进程树。
      </p>
      <div className="mt-3 grid gap-2">
        <select
          value={cwd}
          onChange={e => setCwd(e.target.value)}
          className="h-9 w-full rounded-md border bg-[var(--color-background)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          {dirs.length === 0 && <option value="">（无可用项目目录）</option>}
          {dirs.map(d => <option key={d.path} value={d.path}>{d.label}</option>)}
        </select>
        <Input
          value={command}
          onChange={e => setCmd(e.target.value)}
          placeholder={commandPlaceholder ?? `启动命令（留空=默认：${defaultCommand}）`}
          className="font-mono text-xs"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => { setMsg(null); start.mutate() }} disabled={busy || running || !cwd}>
          {start.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}启动
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setMsg(null); stop.mutate() }} disabled={busy || !running}>
          {stop.isPending ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}停止
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setMsg(null); restart.mutate() }} disabled={busy || !cwd}>
          {restart.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}重启（生效）
        </Button>
        {msg && <span className="text-xs text-[var(--color-destructive)]">{msg}</span>}
      </div>
      <div className="mt-3 mb-1 flex items-center justify-between">
        <span className="text-xs text-[var(--color-muted-foreground)]">启动日志（{lines.length} 行）</span>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => setExpanded(true)}>
          <Maximize2 className="size-3.5" />放大
        </Button>
      </div>
      <div
        ref={logRef}
        onDoubleClick={() => setExpanded(true)}
        title="双击放大"
        className="h-64 cursor-zoom-in overflow-auto rounded-md border bg-[#0b0f14] p-2 font-mono text-[11px] leading-relaxed text-[#cbd5e1]"
      >
        {renderLog()}
      </div>

      {expanded && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-4 sm:p-8" onClick={() => setExpanded(false)}>
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[#1e2733] bg-[#0b0f14] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#1e2733] px-3 py-2">
              <span className="flex items-center gap-2 font-mono text-xs text-[#cbd5e1]">
                <ScrollText className="size-4" />{title}
                {running ? <span className="text-emerald-400">· 运行中 pid {status?.pid}</span> : <span className="text-[#64748b]">· 已停止</span>}
                <span className="text-[#64748b]">（{lines.length} 行 · Esc 关闭）</span>
              </span>
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-[#cbd5e1] hover:bg-white/10" onClick={() => setExpanded(false)}>
                <X className="size-4" />关闭
              </Button>
            </div>
            <div ref={bigLogRef} className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[13px] leading-relaxed text-[#cbd5e1]">
              {renderLog()}
            </div>
          </div>
        </div>
      )}
    </details>
  )
}
