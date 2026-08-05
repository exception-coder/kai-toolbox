import { useEffect, useRef, useState } from 'react'
import { Check, Clipboard, Database, Loader2, Maximize2, Minimize2, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import {
  deleteSessionPendingSql,
  getSessionPendingSql,
  saveSessionPendingSql,
  updateSessionPendingSqlStatus,
} from '../api'
import type { PendingSqlChangeType, PendingSqlStatus, SessionPendingSql } from '../types'

interface Props {
  sessionId: string
  onClose: () => void
  onChanged?: (value: SessionPendingSql | null) => void
}

const STATUS_LABELS: Record<PendingSqlStatus, string> = {
  PENDING: '待执行',
  EXECUTED: '已执行',
  CANCELLED: '已取消',
}

/** 会话级待执行 SQL 登记面板，只维护本地台账，不提供执行入口。 */
export function PendingSqlPanel({ sessionId, onClose, onChanged }: Props) {
  const confirm = useConfirm()
  const [registration, setRegistration] = useState<SessionPendingSql | null | undefined>(undefined)
  const [title, setTitle] = useState('')
  const [targetEnvironment, setTargetEnvironment] = useState('')
  const [changeType, setChangeType] = useState<PendingSqlChangeType>('MIXED')
  const [sqlText, setSqlText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const sqlAreaRef = useRef<HTMLTextAreaElement>(null)
  const [sqlViewport, setSqlViewport] = useState({
    firstLine: 1,
    lastLine: 1,
    totalLines: 1,
    progress: 0,
    thumbTop: 0,
    thumbHeight: 100,
    scrollable: false,
  })

  const updateSqlViewport = (element: HTMLTextAreaElement | null) => {
    if (!element) return
    const lineHeight = 24
    const totalLines = Math.max(1, element.value.split('\n').length)
    const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight)
    const progress = maxScroll > 0 ? Math.min(100, Math.round((element.scrollTop / maxScroll) * 100)) : 0
    const visibleLineCount = Math.max(1, Math.floor(element.clientHeight / lineHeight))
    const firstLine = Math.min(totalLines, Math.floor(element.scrollTop / lineHeight) + 1)
    const lastLine = Math.min(totalLines, firstLine + visibleLineCount - 1)
    const thumbHeight = maxScroll > 0
      ? Math.max(8, Math.min(100, (element.clientHeight / element.scrollHeight) * 100))
      : 100
    const thumbTop = maxScroll > 0 ? (progress / 100) * (100 - thumbHeight) : 0

    setSqlViewport({ firstLine, lastLine, totalLines, progress, thumbTop, thumbHeight, scrollable: maxScroll > 0 })
  }

  useEffect(() => {
    let alive = true
    setRegistration(undefined)
    setError(null)
    getSessionPendingSql(sessionId)
      .then(value => {
        if (!alive) return
        setRegistration(value)
        setTitle(value?.title ?? '')
        setTargetEnvironment(value?.targetEnvironment ?? '')
        setChangeType(value?.changeType ?? 'MIXED')
        setSqlText(value?.sqlText ?? '')
      })
      .catch(reason => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => { alive = false }
  }, [sessionId])

  useEffect(() => {
    const element = sqlAreaRef.current
    if (!element) return
    const frame = window.requestAnimationFrame(() => updateSqlViewport(element))
    const observer = new ResizeObserver(() => updateSqlViewport(element))
    observer.observe(element)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [registration, sqlText, isFullscreen])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (isFullscreen) {
        setIsFullscreen(false)
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isFullscreen, onClose])

  const handleSave = async () => {
    if (!sqlText.trim()) {
      setError('请填写 SQL 内容')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const saved = await saveSessionPendingSql(sessionId, {
        title: title.trim(),
        targetEnvironment: targetEnvironment.trim(),
        changeType,
        sqlText,
      })
      setRegistration(saved)
      setSqlText(saved.sqlText)
      onChanged?.(saved)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const handleStatus = async (status: PendingSqlStatus) => {
    setBusy(true)
    setError(null)
    try {
      const updated = await updateSessionPendingSqlStatus(sessionId, status)
      setRegistration(updated)
      onChanged?.(updated)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const handleCopy = async () => {
    if (!sqlText) return
    try {
      await navigator.clipboard.writeText(sqlText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setError('复制失败，请手动选择 SQL 内容复制')
    }
  }

  const handleDelete = async () => {
    const accepted = await confirm({
      title: '解除待执行 SQL 登记',
      description: '将删除当前会话关联的 SQL 台账内容，此操作不会影响会话，也不会操作业务数据库。',
      confirmText: '确认解除',
      variant: 'destructive',
    })
    if (!accepted) return
    setBusy(true)
    setError(null)
    try {
      await deleteSessionPendingSql(sessionId)
      setRegistration(null)
      setTitle('')
      setTargetEnvironment('')
      setChangeType('MIXED')
      setSqlText('')
      onChanged?.(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex justify-center bg-black/40',
        isFullscreen ? 'items-stretch p-0' : 'items-start px-3 pt-10 sm:pt-16',
      )}
      onClick={onClose}
    >
      <div
        className={cn(
          'flex w-full flex-col overflow-hidden bg-[var(--color-card)] shadow-2xl',
          isFullscreen
            ? 'h-[100dvh] max-h-none max-w-none rounded-none border-0'
            : 'max-h-[85vh] max-w-2xl rounded-xl border',
        )}
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Database className="size-4 text-[var(--color-primary)]" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">待执行 SQL</span>
          {registration && (
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${registration.status === 'PENDING'
              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
              : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'}`}
            >
              {STATUS_LABELS[registration.status]}
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsFullscreen(value => !value)}
            className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
            aria-label={isFullscreen ? '退出全屏' : '全屏查看'}
            title={isFullscreen ? '退出全屏' : '全屏查看'}
          >
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]" aria-label="关闭">
            <X className="size-3.5" />
          </button>
        </div>

        <div className={cn(
          'min-h-0 flex-1 px-4 py-4',
          isFullscreen ? 'flex flex-col gap-3 overflow-hidden' : 'space-y-3 overflow-y-auto',
        )}>
          <div className="rounded-lg border border-amber-300/60 bg-amber-50/70 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            这里只登记和复制 SQL，不会连接或执行任何数据库。请勿填写密码、Token 等凭据。
          </div>

          {registration === undefined ? (
            <div className="flex items-center gap-2 py-8 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="size-4 animate-spin" />加载登记信息…
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium">
                  <span>登记标题</span>
                  <input
                    value={title}
                    onChange={event => setTitle(event.target.value)}
                    placeholder="例如：新增报价有效期字段"
                    className="h-9 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium">
                  <span>目标库 / 环境</span>
                  <input
                    value={targetEnvironment}
                    onChange={event => setTargetEnvironment(event.target.value)}
                    placeholder="例如：SRM 测试库 / 生产库"
                    className="h-9 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm outline-none focus:border-[var(--color-primary)]"
                  />
                </label>
              </div>

              <label className="block space-y-1 text-xs font-medium">
                <span>变更类型</span>
                <select
                  value={changeType}
                  onChange={event => setChangeType(event.target.value as PendingSqlChangeType)}
                  className="h-9 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm outline-none focus:border-[var(--color-primary)] sm:w-52"
                >
                  <option value="DDL">DDL · 表结构</option>
                  <option value="DML">DML · 数据变更</option>
                  <option value="MIXED">混合 SQL</option>
                </select>
              </label>

              <label className={cn(
                'text-xs font-medium',
                isFullscreen ? 'flex min-h-32 flex-1 flex-col gap-1' : 'block space-y-1',
              )}>
                <span className="flex items-center justify-between gap-3">
                  <span>SQL 内容</span>
                  <span className="font-normal tabular-nums text-[var(--color-muted-foreground)]">
                    {sqlViewport.scrollable
                      ? `第 ${sqlViewport.firstLine}–${sqlViewport.lastLine} / ${sqlViewport.totalLines} 行 · ${sqlViewport.progress}%`
                      : `${sqlViewport.totalLines} 行 · 全部可见`}
                  </span>
                </span>
                <div className={cn(
                  'relative overflow-hidden rounded-md border bg-slate-950 focus-within:border-[var(--color-primary)]',
                  isFullscreen ? 'min-h-0 flex-1' : 'h-72',
                )}>
                  <textarea
                    ref={sqlAreaRef}
                    value={sqlText}
                    onChange={event => {
                      setSqlText(event.target.value)
                      updateSqlViewport(event.currentTarget)
                    }}
                    onScroll={event => updateSqlViewport(event.currentTarget)}
                    placeholder="粘贴待执行的 DDL / DML，可包含多条语句…"
                    spellCheck={false}
                    className="h-full w-full resize-none overflow-y-scroll bg-transparent p-3 pr-8 font-mono text-sm leading-6 text-slate-100 outline-none [scrollbar-gutter:stable] [scrollbar-width:auto] [&::-webkit-scrollbar]:w-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-500 [&::-webkit-scrollbar-track]:bg-slate-800"
                  />
                  <div
                    className="pointer-events-none absolute bottom-2 right-4 top-2 w-1.5 overflow-hidden rounded-full bg-white/10"
                    aria-hidden="true"
                  >
                    <div
                      className="absolute left-0 right-0 rounded-full bg-cyan-400/80 shadow-[0_0_6px_rgba(34,211,238,0.45)] transition-[top,height] duration-100"
                      style={{ top: `${sqlViewport.thumbTop}%`, height: `${sqlViewport.thumbHeight}%` }}
                    />
                  </div>
                </div>
              </label>

              {error && <p className="text-xs text-[var(--color-destructive)]">{error}</p>}

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={busy || !sqlText.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-2 text-xs font-medium text-[var(--color-primary-foreground)] disabled:opacity-50"
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                  {registration ? '保存并设为待执行' : '登记待执行 SQL'}
                </button>
                <button type="button" onClick={handleCopy} disabled={!sqlText} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs disabled:opacity-50">
                  {copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}
                  {copied ? '已复制' : '复制 SQL'}
                </button>
                {registration && registration.status !== 'EXECUTED' && (
                  <button type="button" onClick={() => handleStatus('EXECUTED')} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/50 px-3 py-2 text-xs text-emerald-700 disabled:opacity-50 dark:text-emerald-400">
                    <Check className="size-3.5" />标记已执行
                  </button>
                )}
                {registration && registration.status !== 'PENDING' && (
                  <button type="button" onClick={() => handleStatus('PENDING')} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs disabled:opacity-50">
                    <RotateCcw className="size-3.5" />恢复待执行
                  </button>
                )}
                {registration && registration.status === 'PENDING' && (
                  <button type="button" onClick={() => handleStatus('CANCELLED')} disabled={busy} className="rounded-md border px-3 py-2 text-xs text-[var(--color-muted-foreground)] disabled:opacity-50">
                    标记已取消
                  </button>
                )}
                {registration && (
                  <button type="button" onClick={handleDelete} disabled={busy} className="ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-2 text-xs text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10 disabled:opacity-50">
                    <Trash2 className="size-3.5" />解除关联
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
