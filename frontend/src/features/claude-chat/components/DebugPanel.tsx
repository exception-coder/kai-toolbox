import { useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Dot, Pause, Play, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { clearDebug, getDebugLog, subscribeDebug, type DebugEntry } from '../lib/debugLog'

function fmtTs(ts: number): string {
  const d = new Date(ts)
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

/**
 * 调试模式弹框：实时显示前端 ↔ 后端(转发自 node sidecar) 的每条 WS 交互（收/发/连接、时间、type、seq、
 * 完整 payload），帮助理解完整交互过程 & 排查卡死。可暂停、清空、复制全部、按 type 筛选。
 */
export function DebugPanel({ onClose }: { onClose: () => void }) {
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [paused, setPaused] = useState(false)
  const [filter, setFilter] = useState('')
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const pendingRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 订阅日志：暂停时不刷新；用 rAF 合并高频突发（流式 assistantDelta 可能每秒多条），避免过度渲染。
  useEffect(() => subscribeDebug(() => {
    if (pausedRef.current || pendingRef.current) return
    pendingRef.current = true
    requestAnimationFrame(() => { pendingRef.current = false; force() })
  }), [])

  const all = getDebugLog()
  const f = filter.trim().toLowerCase()
  const entries = f ? all.filter(e => e.type.toLowerCase().includes(f) || e.dir.includes(f)) : all

  // 跟随到底（未暂停时）
  useLayoutEffect(() => {
    if (paused) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  })

  const copyAll = () => {
    const text = entries.map(e => `[${fmtTs(e.ts)}] ${dirLabel(e.dir)} ${e.type}${e.seq != null ? ` #${e.seq}` : ''}\n${e.text}`).join('\n\n')
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
      document.body.appendChild(ta); ta.select(); try { document.execCommand('copy') } catch { /* ignore */ } document.body.removeChild(ta)
    })
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-3" onClick={onClose} role="dialog" aria-label="调试模式">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl border bg-[var(--color-background)] shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <span className="text-sm font-semibold">调试模式 · 实时交互日志</span>
          <span className="text-xs text-[var(--color-muted-foreground)]">{entries.length} 条 · 前端↔后端(转发 node sidecar 事件)</span>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="筛选 type（如 assistantDelta / result）"
            className="ml-2 h-7 w-52 rounded-md border bg-[var(--color-background)] px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          />
          <button type="button" onClick={() => setPaused(p => !p)} title={paused ? '继续' : '暂停'} className="ml-auto rounded-md p-1 hover:bg-[var(--color-muted)]">
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </button>
          <button type="button" onClick={copyAll} title="复制全部" className="rounded-md p-1 hover:bg-[var(--color-muted)]"><Copy className="size-4" /></button>
          <button type="button" onClick={() => clearDebug()} title="清空" className="rounded-md p-1 hover:bg-[var(--color-muted)]"><Trash2 className="size-4" /></button>
          <button type="button" onClick={onClose} title="关闭" className="rounded-md p-1 hover:bg-[var(--color-muted)]"><X className="size-4" /></button>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed">
          {entries.length === 0 && <div className="p-3 text-center text-[var(--color-muted-foreground)]">暂无交互；发一条消息即可看到实时事件流。</div>}
          {entries.map(e => <Row key={e.id} e={e} />)}
        </div>

        <div className="border-t px-3 py-1.5 text-[11px] text-[var(--color-muted-foreground)]">
          ↓ 后端→前端(sidecar 事件) · ↑ 前端→后端 · • 连接。{paused && <span className="text-[var(--color-destructive)]"> 已暂停（不再刷新）</span>}
        </div>
      </div>
    </div>
  )
}

function dirLabel(dir: DebugEntry['dir']): string {
  return dir === 'recv' ? '↓recv' : dir === 'send' ? '↑send' : '•conn'
}

function Row({ e }: { e: DebugEntry }) {
  const [open, setOpen] = useState(false)
  const long = e.text.length > 300
  const body = open || !long ? e.text : e.text.slice(0, 300) + '…'
  const dirCls = e.dir === 'recv'
    ? 'text-emerald-600 dark:text-emerald-400'
    : e.dir === 'send'
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-[var(--color-muted-foreground)]'
  const Icon = e.dir === 'recv' ? ArrowDown : e.dir === 'send' ? ArrowUp : Dot
  return (
    <div className="border-b border-[var(--color-border)]/40 py-1">
      <div className="flex items-center gap-1.5">
        <span className="text-[var(--color-muted-foreground)]">{fmtTs(e.ts)}</span>
        <Icon className={cn('size-3.5 shrink-0', dirCls)} />
        <span className={cn('font-semibold', dirCls)}>{e.type}</span>
        {e.seq != null && <span className="text-[var(--color-muted-foreground)]">#{e.seq}</span>}
        {long && (
          <button type="button" onClick={() => setOpen(o => !o)} className="ml-auto rounded px-1 text-[10px] text-[var(--color-primary)] hover:underline">
            {open ? '收起' : '展开'}
          </button>
        )}
      </div>
      <pre className="mt-0.5 whitespace-pre-wrap break-all text-[var(--color-foreground)]/80">{body}</pre>
    </div>
  )
}
