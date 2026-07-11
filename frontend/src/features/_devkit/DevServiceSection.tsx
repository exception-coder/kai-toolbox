import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, Maximize2, Play, RotateCw, ScrollText, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  devServiceLogStream, getDevServiceStatus, startDevService, stopDevService, restartDevService,
  checkDevPorts, type DevServiceStatus,
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
  /**
   * 服务就绪徽标条（可选）：一条命令拉起多个子服务时，列出各子服务的 label + 端口，
   * 由后端 TCP 探端口判绿/灰，直观显示"哪些起好了"。留空=不显示（单服务无需）。
   */
  readinessPorts?: { label: string; port: number }[]
}

// 日志级别配色（暗底控制台）。整行按命中的最高级别着色；默认灰。
const LOG_RED = /\[(?:failed|reason):|(?:^|\s)(?:ERROR|SEVERE|FATAL)\b|BUILD FAILURE|^\s*(?:[\w.$]+\.)?[A-Z][\w.$]*(?:Exception|Error)\b\s*[:]/
const LOG_AMBER = /(?:^|\s)WARN(?:ING)?\b|\[WARNING\]/
const LOG_SKY = /(?:^|\s)INFO\b|\[INFO\]/
const LOG_DIM = /(?:^|\s)(?:DEBUG|TRACE)\b|\[DEBUG\]/

/** 单行日志 → tailwind 颜色类（优先级：红 > 黄 > 蓝 > 暗 > 继承默认）。 */
function logLineClass(line: string): string {
  if (LOG_RED.test(line)) return 'text-red-400'
  if (LOG_AMBER.test(line)) return 'text-amber-400'
  if (LOG_SKY.test(line)) return 'text-sky-300'
  if (LOG_DIM.test(line)) return 'text-slate-500'
  return ''
}

/**
 * 通用「服务启停 + 前台启动日志」区：在工作台直接起停某项目服务并实时看控制台日志（SSE + 放大浮层），
 * 也用于自闭环验证「改完重启让改动生效」。**只能起停/读取本工作台拉起的服务**。
 * 是各「XX 需求开发」模块共用的组件，由脚手架生成的模块直接引用。
 */
export function DevServiceSection({
  serviceId, dirs, defaultCwd, defaultCommand,
  commandPlaceholder, title = '服务启停 + 启动日志', stopCommand, readinessPorts,
}: Props) {
  const CMD_KEY = `kai-toolbox:dev:start-cmd:${serviceId}`
  const [cwd, setCwd] = useState(defaultCwd)
  const [command, setCommand] = useState(() => {
    try { return localStorage.getItem(CMD_KEY) ?? '' } catch { return '' }
  })
  const [status, setStatus] = useState<DevServiceStatus | null>(null)
  const [lines, setLines] = useState<string[]>([])
  const [serviceFailures, setServiceFailures] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)
  const bigLogRef = useRef<HTMLDivElement>(null)
  // 日志性能：SSE 行先入缓冲，定时批量并入（避免每行一次 re-render）；pinnedRef=用户是否吸底。
  const MAX_LOG_LINES = 2000
  const bufferRef = useRef<string[]>([])
  const pinnedRef = useRef(true)

  useEffect(() => { if (defaultCwd) setCwd(defaultCwd) }, [defaultCwd])

  useEffect(() => { getDevServiceStatus(serviceId).then(setStatus).catch(() => {}) }, [serviceId])

  // SSE 实时日志/状态：连上即回放缓冲,故每次 open 先清空避免重连重复。
  // 行不再逐条 setState（高频流会把整列表重渲成千次），而是入缓冲、每 200ms 批量并入一次。
  useEffect(() => {
    bufferRef.current = []
    const es = new EventSource(devServiceLogStream(serviceId))
    es.onopen = () => { bufferRef.current = []; setLines([]) }
    const onLine = (e: Event) => {
      const line = (e as MessageEvent).data as string
      bufferRef.current.push(line)
      const failure = line.match(/^\[failed:([^\]]+)]\s*(.*)$/)
      const reason = line.match(/^\[reason:([^\]]+)]\s*(.*)$/)
      const match = reason ?? failure
      if (match) {
        const label = match[1].replace(/-server$/, '')
        setServiceFailures(prev => ({ ...prev, [label]: match[2] || 'Process exited unexpectedly.' }))
      }
    }
    es.addEventListener('log', onLine)
    es.addEventListener('exit', onLine)
    es.addEventListener('status', e => { try { setStatus(JSON.parse((e as MessageEvent).data)) } catch { /* ignore */ } })
    const flush = setInterval(() => {
      if (bufferRef.current.length === 0) return
      const incoming = bufferRef.current
      bufferRef.current = []
      setLines(prev => {
        const merged = prev.length + incoming.length > MAX_LOG_LINES
          ? [...prev, ...incoming].slice(-MAX_LOG_LINES)
          : [...prev, ...incoming]
        return merged
      })
    }, 200)
    return () => { clearInterval(flush); es.close() }
  }, [serviceId])

  // 仅当用户吸底时自动滚到底（往上翻看历史时不打断）。用 rAF 合并布局读写。
  useEffect(() => {
    if (!pinnedRef.current) return
    const el = expanded ? bigLogRef.current : logRef.current
    if (!el) return
    const id = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
    return () => cancelAnimationFrame(id)
  }, [lines, expanded])

  // 滚动时判断是否仍吸底（距底 < 40px 视为吸底）。
  const onLogScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

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

  // 多服务就绪探测：后端 TCP 探各端口，每 4s 刷新（仅当传了 readinessPorts）。
  const hasReadiness = !!readinessPorts && readinessPorts.length > 0
  const readiness = useQuery({
    queryKey: ['dev-service-ports', serviceId, (readinessPorts ?? []).map(p => p.port).join(',')],
    queryFn: () => checkDevPorts((readinessPorts ?? []).map(p => p.port)),
    enabled: hasReadiness,
    refetchInterval: 4000,
  })

  // 逐行按级别上色。用 content-visibility:auto 让屏幕外行跳过布局/绘制，保住长日志滚动性能；
  // useMemo 仅在 lines 变化时重建（不受就绪轮询/放大切换等 re-render 影响）。
  const logNodes = useMemo(
    () => lines.map((l, i) => (
      <div
        key={i}
        className={`whitespace-pre-wrap break-all [content-visibility:auto] [contain-intrinsic-size:auto_16px] ${logLineClass(l)}`}
      >
        {l === '' ? ' ' : l}
      </div>
    )),
    [lines],
  )
  const renderLog = () => lines.length === 0
    ? <div className="text-[#64748b]">暂无日志。点「启动」拉起服务后，这里实时显示前台控制台输出。</div>
    : logNodes

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
        <div>
          <div className="relative">
            <Input
              value={command}
              onChange={e => setCmd(e.target.value)}
              placeholder={commandPlaceholder ?? `启动命令（留空=默认：${defaultCommand}）`}
              className="font-mono text-xs pr-8"
            />
            {command.length > 0 && (
              <button
                type="button"
                title="恢复默认命令（清空自定义命令）"
                onClick={() => setCmd('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
          {command.trim().length > 0 && (
            <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
              正在用<b>自定义命令</b>覆盖默认；默认为 <code className="rounded bg-[var(--color-muted)] px-1">{defaultCommand}</code>。点右侧 × 恢复默认。
            </p>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => { setMsg(null); setServiceFailures({}); start.mutate() }} disabled={busy || running || !cwd}>
          {start.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}启动
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setMsg(null); stop.mutate() }} disabled={busy || !running}>
          {stop.isPending ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}停止
        </Button>
        <Button size="sm" variant="outline" onClick={() => { setMsg(null); setServiceFailures({}); restart.mutate() }} disabled={busy || !cwd}>
          {restart.isPending ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}重启（生效）
        </Button>
        {msg && <span className="text-xs text-[var(--color-destructive)]">{msg}</span>}
      </div>
      {hasReadiness && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--color-muted-foreground)]">就绪：</span>
          {readinessPorts!.map(rp => {
            const up = readiness.data?.[String(rp.port)] === true
            const failure = up ? null : serviceFailures[rp.label]
            const badgeClass = failure
              ? 'border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400'
              : ''
            return (
              <button
                key={rp.port}
                type="button"
                disabled={!failure}
                title={failure ? `${failure}（点击查看完整日志）` : undefined}
                onClick={() => { pinnedRef.current = true; setExpanded(true) }}
                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] disabled:cursor-default ${badgeClass}`}
              >
                <span className={`inline-block size-2 rounded-full ${up ? 'bg-emerald-500' : failure ? 'bg-red-500' : 'bg-[var(--color-muted-foreground)]/40'}`} />
                {rp.label}<span className="text-[var(--color-muted-foreground)]">:{rp.port}</span>
                {failure && <span className="max-w-72 truncate">— {failure}</span>}
              </button>
            )
          })}
          <span className="text-[10px] text-[var(--color-muted-foreground)]">（每 4s 探端口）</span>
        </div>
      )}
      <div className="mt-3 mb-1 flex items-center justify-between">
        <span className="text-xs text-[var(--color-muted-foreground)]">启动日志（{lines.length} 行）</span>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={() => { pinnedRef.current = true; setExpanded(true) }}>
          <Maximize2 className="size-3.5" />放大
        </Button>
      </div>
      <div
        ref={logRef}
        onScroll={onLogScroll}
        onDoubleClick={() => { pinnedRef.current = true; setExpanded(true) }}
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
            <div ref={bigLogRef} onScroll={onLogScroll} className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[13px] leading-relaxed text-[#cbd5e1]">
              {renderLog()}
            </div>
          </div>
        </div>
      )}
    </details>
  )
}
