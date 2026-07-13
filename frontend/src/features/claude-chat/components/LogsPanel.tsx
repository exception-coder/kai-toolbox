import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Copy, RotateCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchRecentLogs } from '../api'

/** 可筛选的日志级别；'all' = 不筛选。顺序即分段控件展示顺序。 */
type Level = 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'
type Filter = 'all' | Level
const LEVELS: Level[] = ['ERROR', 'WARN', 'INFO', 'DEBUG']

/** 一条日志（可能含多行:堆栈/换行消息)。level 取自行首级别标记,续行归属上一条。 */
interface LogEntry {
  level: Level | null // null = 无法识别级别的续行/分隔行(如「…略过 N 行…」)
  text: string
}

// 后端渲染格式:`HH:mm:ss.SSS LEVEL [thread] logger - message`(见 RecentLogsService#format)。
// 行首匹配「时间 + 级别」即视为新条目开头;不匹配的行(堆栈 at .../Caused by 等)并入上一条。
const HEAD_RE = /^\d{2}:\d{2}:\d{2}\.\d{3}\s+(ERROR|WARN|INFO|DEBUG|TRACE)\b/

const LEVEL_STYLE: Record<Level, string> = {
  ERROR: 'text-red-600 dark:text-red-400',
  WARN: 'text-amber-600 dark:text-amber-400',
  INFO: 'text-[var(--color-foreground)]',
  DEBUG: 'text-[var(--color-muted-foreground)]',
}
const CHIP_ACTIVE: Record<Filter, string> = {
  all: 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]',
  ERROR: 'bg-red-600 text-white',
  WARN: 'bg-amber-500 text-white',
  INFO: 'bg-sky-600 text-white',
  DEBUG: 'bg-[var(--color-muted-foreground)] text-[var(--color-background)]',
}

/** 把纯文本日志切成条目:识别行首级别,续行(堆栈)并入上一条,保证按级别筛选时不截断多行错误。 */
function parseEntries(raw: string): LogEntry[] {
  const lines = raw.split(/\r?\n/)
  const out: LogEntry[] = []
  for (const line of lines) {
    const m = HEAD_RE.exec(line)
    if (m) {
      // TRACE 归入 DEBUG 档展示(后端极少产 TRACE)
      const lv = m[1] === 'TRACE' ? 'DEBUG' : (m[1] as Level)
      out.push({ level: lv, text: line })
    } else if (out.length > 0) {
      out[out.length - 1] = { ...out[out.length - 1], text: out[out.length - 1].text + '\n' + line }
    } else {
      out.push({ level: null, text: line }) // 开头就无级别(提示语/空缓存文案)
    }
  }
  return out
}

/**
 * 最新日志面板:从后端内存缓冲取最近日志(含透传进来的 sidecar 日志),按级别筛选查看,
 * 一键复制贴给 AI 定位问题。全量拉取后在前端按 ERROR/WARN/INFO/DEBUG 分级筛选与着色。
 */
export function LogsPanel({ onClose }: { onClose: () => void }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [raw, setRaw] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 拉全量,级别筛选在前端做——切级别不再往返后端,也能保留堆栈上下文。
      const t = await fetchRecentLogs('all', 500)
      setRaw(t)
      requestAnimationFrame(() => {
        const el = preRef.current
        if (el) el.scrollTop = el.scrollHeight
      })
    } catch (e) {
      setError((e as Error)?.message ?? '读取日志失败')
      setRaw('')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const entries = useMemo(() => parseEntries(raw), [raw])
  const counts = useMemo(() => {
    const c: Record<Level, number> = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 }
    for (const e of entries) if (e.level) c[e.level]++
    return c
  }, [entries])
  const shown = useMemo(
    () => (filter === 'all' ? entries : entries.filter(e => e.level === filter)),
    [entries, filter],
  )
  const shownText = useMemo(() => shown.map(e => e.text).join('\n'), [shown])

  // 切筛选后滚到底(最新在末尾)
  useEffect(() => {
    const el = preRef.current
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
  }, [filter, shownText])

  const copy = async () => {
    if (!shownText) return
    try {
      await navigator.clipboard.writeText(shownText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 剪贴板不可用(非 https / 权限):选中 pre 内容兜底
      const el = preRef.current
      if (el) {
        const sel = window.getSelection()
        const range = document.createRange()
        range.selectNodeContents(el)
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 sm:p-6" onClick={onClose}>
      <div
        className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border bg-[var(--color-background)] shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部:标题 + 级别筛选 + 操作 */}
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <span className="font-semibold">最新日志</span>
          <div className="flex overflow-hidden rounded-md border text-xs">
            <FilterChip label="全部" active={filter === 'all'} activeClass={CHIP_ACTIVE.all} onClick={() => setFilter('all')} />
            {LEVELS.map(lv => (
              <FilterChip
                key={lv}
                label={`${lv}${counts[lv] ? ` ${counts[lv]}` : ''}`}
                active={filter === lv}
                activeClass={CHIP_ACTIVE[lv]}
                bordered
                onClick={() => setFilter(lv)}
              />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" className="gap-1 px-2" onClick={() => load()} disabled={loading} aria-label="刷新">
              <RotateCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> <span className="hidden sm:inline">刷新</span>
            </Button>
            <Button variant="ghost" size="sm" className="gap-1 px-2" onClick={copy} disabled={!shownText} aria-label="复制">
              {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
              <span className="hidden sm:inline">{copied ? '已复制' : '复制'}</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
              <X className="size-5" />
            </Button>
          </div>
        </div>

        {/* 提示 */}
        <p className="border-b bg-[var(--color-muted)]/40 px-3 py-1.5 text-[11px] text-[var(--color-muted-foreground)]">
          含后端 + Codex/Claude sidecar 日志(缓存最近 500 条)。按级别筛选查看;「复制」按当前筛选结果贴给我定位问题。
        </p>

        {/* 正文 */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-red-600 dark:text-red-400">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={() => load()}>重试</Button>
            </div>
          ) : (
            <pre
              ref={preRef}
              className="h-full overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-[11px] leading-relaxed text-[var(--color-foreground)]"
            >
              {loading && !raw
                ? '正在读取日志…'
                : shown.length === 0
                  ? (filter === 'all' ? '(暂无日志)' : `(最近日志里没有 ${filter} 级别)`)
                  : shown.map((e, i) => (
                    <span key={i} className={`block ${e.level ? LEVEL_STYLE[e.level] : 'text-[var(--color-muted-foreground)]'}`}>
                      {e.text}
                    </span>
                  ))}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

function FilterChip({ label, active, activeClass, bordered, onClick }: {
  label: string
  active: boolean
  activeClass: string
  bordered?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 tabular-nums ${bordered ? 'border-l' : ''} ${active
        ? activeClass
        : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'}`}
    >
      {label}
    </button>
  )
}
