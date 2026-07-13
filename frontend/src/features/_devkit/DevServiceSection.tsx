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

// 日志级别识别（暗底控制台）。整行按命中的最高级别归类；其余归 other。
const LOG_RED = /\[(?:failed|reason):|(?:^|\s)(?:ERROR|SEVERE|FATAL)\b|BUILD FAILURE|^\s*(?:[\w.$]+\.)?[A-Z][\w.$]*(?:Exception|Error)\b\s*[:]/
const LOG_AMBER = /(?:^|\s)WARN(?:ING)?\b|\[WARNING\]/
const LOG_SKY = /(?:^|\s)INFO\b|\[INFO\]/

type LogLevel = 'error' | 'warn' | 'info' | 'other'
interface LogLine { t: string; lv: LogLevel }

/** 单行日志 → 级别（优先级：error > warn > info > other；DEBUG/TRACE 等归 other）。 */
function levelOf(line: string): LogLevel {
  if (LOG_RED.test(line)) return 'error'
  if (LOG_AMBER.test(line)) return 'warn'
  if (LOG_SKY.test(line)) return 'info'
  return 'other'
}
const LEVEL_CLASS: Record<LogLevel, string> = {
  error: 'text-red-400', warn: 'text-amber-400', info: 'text-sky-300', other: '',
}

/** 超出上限时丢弃最旧的【非 error】行；error 行固定保留、不被刷掉（按需求）。 */
function trimKeepErrors(list: LogLine[], max: number): LogLine[] {
  const errorCount = list.reduce((n, l) => n + (l.lv === 'error' ? 1 : 0), 0)
  const otherBudget = Math.max(0, max - errorCount)
  let othersKept = 0
  const keep: boolean[] = new Array(list.length)
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].lv === 'error') { keep[i] = true }
    else if (othersKept < otherBudget) { keep[i] = true; othersKept++ }
    else { keep[i] = false }
  }
  return list.filter((_, i) => keep[i])
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
  const [lines, setLines] = useState<LogLine[]>([])
  const [serviceFailures, setServiceFailures] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  // 级别筛选：默认全开；至少保留一个级别（不允许全关）。
  const [activeLevels, setActiveLevels] = useState<Set<LogLevel>>(() => new Set<LogLevel>(['error', 'warn', 'info', 'other']))
  const logRef = useRef<HTMLDivElement>(null)
  const bigLogRef = useRef<HTMLDivElement>(null)
  // 日志性能：SSE 行先入缓冲，定时批量并入（避免每行一次 re-render）；pinnedRef=用户是否吸底。
  const MAX_LOG_LINES = 2000
  const bufferRef = useRef<LogLine[]>([])
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
      // 新一轮启动标记（DevServiceManager 在 start() 时 emit「▶ 启动中」）：清掉上一轮历史日志 + 失败徽标，
      // 避免上次失败的 ERROR 因「固定保留」混进本轮、让人分不清是本次还是历史。
      if (line.includes('▶ 启动中')) {
        bufferRef.current = []
        setServiceFailures({})
        setLines([{ t: line, lv: levelOf(line) }])
        pinnedRef.current = true
        return
      }
      bufferRef.current.push({ t: line, lv: levelOf(line) })
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
        const merged = [...prev, ...incoming]
        // 超上限时丢最旧的非 error 行，error 固定保留。
        return merged.length > MAX_LOG_LINES ? trimKeepErrors(merged, MAX_LOG_LINES) : merged
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
  const counts = useMemo(() => {
    const c: Record<LogLevel, number> = { error: 0, warn: 0, info: 0, other: 0 }
    for (const l of lines) c[l.lv]++
    return c
  }, [lines])
  const visible = useMemo(() => lines.filter(l => activeLevels.has(l.lv)), [lines, activeLevels])
  const logNodes = useMemo(
    () => visible.map((l, i) => (
      <div
        key={i}
        className={`whitespace-pre-wrap break-all [content-visibility:auto] [contain-intrinsic-size:auto_16px] ${LEVEL_CLASS[l.lv]}`}
      >
        {l.t === '' ?' ' : l.t}
      </div>
    )),
    [visible],
  )
  const renderLog = () => lines.length === 0
    ? <div className="text-[#64748b]">暂无日志。点「启动」拉起服务后，这里实时显示前台控制台输出。</div>
    : visible.length === 0
      ? <div className="text-[#64748b]">当前级别筛选无匹配行（点上方级别切换）。</div>
      : logNodes

  // 级别筛选切换（至少保留一个级别，不允许全关）。
  const toggleLevel = (lv: LogLevel) => setActiveLevels(prev => {
    const next = new Set(prev)
    if (next.has(lv)) { next.delete(lv) } else { next.add(lv) }
    return next.size === 0 ? prev : next
  })
  const LEVEL_META: { lv: LogLevel; label: string; on: string; dot: string }[] = [
    { lv: 'error', label: 'ERROR', on: 'border-red-500/60 bg-red-500/10 text-red-400', dot: 'bg-red-500' },
    { lv: 'warn', label: 'WARN', on: 'border-amber-500/60 bg-amber-500/10 text-amber-400', dot: 'bg-amber-500' },
    { lv: 'info', label: 'INFO', on: 'border-sky-500/60 bg-sky-500/10 text-sky-300', dot: 'bg-sky-400' },
    { lv: 'other', label: '其它', on: 'border-slate-500/60 bg-slate-500/10 text-slate-300', dot: 'bg-slate-400' },
  ]
  const renderLevelChips = (dark: boolean) => (
    <div className="flex flex-wrap items-center gap-1">
      {LEVEL_META.map(m => {
        const on = activeLevels.has(m.lv)
        const offCls = dark ? 'border-[#1e2733] text-[#64748b]' : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] opacity-60'
        return (
          <button
            key={m.lv}
            type="button"
            onClick={() => toggleLevel(m.lv)}
            title={`${on ? '隐藏' : '显示'} ${m.label} 级日志`}
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition ${on ? m.on : offCls}`}
          >
            <span className={`inline-block size-1.5 rounded-full ${m.dot} ${on ? '' : 'opacity-40'}`} />
            {m.label}<span className="opacity-70">{counts[m.lv]}</span>
          </button>
        )
      })}
    </div>
  )

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
              name="dev-start-command"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-lpignore="true"
              data-1p-ignore="true"
              data-form-type="other"
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
      <div className="mt-3 mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--color-muted-foreground)]">启动日志（{visible.length}/{lines.length} 行）</span>
          {renderLevelChips(false)}
        </div>
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
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1e2733] px-3 py-2">
              <span className="flex items-center gap-2 font-mono text-xs text-[#cbd5e1] shrink-0">
                <ScrollText className="size-4" />{title}
                {running ? <span className="text-emerald-400">· 运行中 pid {status?.pid}</span> : <span className="text-[#64748b]">· 已停止</span>}
                <span className="text-[#64748b]">（{visible.length}/{lines.length} 行 · Esc 关闭）</span>
              </span>
              <div className="flex items-center gap-2">
                {renderLevelChips(true)}
                <span className="text-[10px] text-[#64748b]">ERROR 固定保留</span>
                <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-[#cbd5e1] hover:bg-white/10" onClick={() => setExpanded(false)}>
                  <X className="size-4" />关闭
                </Button>
              </div>
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
