import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy, RotateCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchRecentLogs } from '../api'

type Mode = 'error' | 'all'

/**
 * 最新日志面板：从后端内存缓冲取最近日志（含透传进来的 sidecar 日志），一键复制贴给 AI 定位问题。
 * 「错误优先」= 最近 WARN/ERROR + 上下文；「全部」= 最近全量。
 */
export function LogsPanel({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('error')
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const preRef = useRef<HTMLPreElement>(null)

  const load = useCallback(async (m: Mode) => {
    setLoading(true)
    setError(null)
    try {
      const t = await fetchRecentLogs(m, 300)
      setText(t)
      // 拉到后滚到底部（最新在末尾）
      requestAnimationFrame(() => {
        const el = preRef.current
        if (el) el.scrollTop = el.scrollHeight
      })
    } catch (e) {
      setError((e as Error)?.message ?? '读取日志失败')
      setText('')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(mode) }, [mode, load])

  // Esc 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const copy = async () => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 剪贴板不可用（非 https / 权限）：选中 pre 内容兜底
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
        {/* 头部：标题 + 模式切换 + 操作 */}
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          <span className="font-semibold">最新日志</span>
          <div className="flex overflow-hidden rounded-md border text-xs">
            <button
              type="button"
              onClick={() => setMode('error')}
              className={`px-2.5 py-1 ${mode === 'error'
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'}`}
            >
              错误优先
            </button>
            <button
              type="button"
              onClick={() => setMode('all')}
              className={`border-l px-2.5 py-1 ${mode === 'all'
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'}`}
            >
              全部
            </button>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" className="gap-1 px-2" onClick={() => load(mode)} disabled={loading} aria-label="刷新">
              <RotateCw className={`size-4 ${loading ? 'animate-spin' : ''}`} /> <span className="hidden sm:inline">刷新</span>
            </Button>
            <Button variant="ghost" size="sm" className="gap-1 px-2" onClick={copy} disabled={!text} aria-label="复制">
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
          含后端 + Codex/Claude sidecar 日志（缓存最近 500 条）。点「复制」直接粘给我定位问题。
        </p>

        {/* 正文 */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-red-600 dark:text-red-400">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={() => load(mode)}>重试</Button>
            </div>
          ) : (
            <pre
              ref={preRef}
              className="h-full overflow-auto whitespace-pre-wrap break-words px-3 py-2 text-[11px] leading-relaxed text-[var(--color-foreground)]"
            >
              {loading && !text ? '正在读取日志…' : (text || '（暂无日志）')}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}
