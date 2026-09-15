import { lazy, Suspense, useEffect, useState } from 'react'
import { Check, Clipboard, Database, Loader2, Save, Trash2, X } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import {
  deleteSessionPendingSql,
  getSessionPendingSql,
  saveSessionPendingSql,
} from '../api'
import type { SessionPendingSql, SessionPendingSqlTarget } from '../types'
import { aggregatePendingSqlChangeType, buildPendingSqlSummary } from '../lib/pendingSqlTargets'

const PendingSqlReviewWorkspace = lazy(() => import('./PendingSqlReviewWorkspace').then(module => ({
  default: module.PendingSqlReviewWorkspace,
})))

interface Props {
  sessionId: string
  onClose: () => void
  onChanged?: (value: SessionPendingSql | null) => void
}

/** 只编辑已登记 SQL；标题、执行库和类型由登记来源维护。 */
export function PendingSqlPanel({ sessionId, onClose, onChanged }: Props) {
  const confirm = useConfirm()
  const [registration, setRegistration] = useState<SessionPendingSql | null | undefined>(undefined)
  const [targets, setTargets] = useState<SessionPendingSqlTarget[]>([])
  const [activeTargetKey, setActiveTargetKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    setRegistration(undefined)
    setError(null)
    getSessionPendingSql(sessionId)
      .then(value => {
        if (!alive) return
        setRegistration(value)
        const loadedTargets = value?.targets ?? []
        setTargets(loadedTargets)
        setActiveTargetKey(loadedTargets[0]?.targetKey ?? '')
      })
      .catch(reason => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => { alive = false }
  }, [sessionId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const activeTarget = targets.find(target => target.targetKey === activeTargetKey) ?? targets[0]

  const updateActiveSql = (sqlText: string) => {
    if (!activeTarget) return
    setTargets(current => current.map(target => target.targetKey === activeTarget.targetKey
      ? { ...target, sqlText, status: 'PENDING', executedAt: null }
      : target))
  }

  const handleSave = async () => {
    if (!registration || targets.length === 0) return
    const emptyTarget = targets.find(target => !target.sqlText.trim())
    if (emptyTarget) {
      setError('SQL 内容不能为空')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const saved = await saveSessionPendingSql(sessionId, {
        title: registration.title ?? '',
        targetEnvironment: registration.targetEnvironment ?? undefined,
        changeType: aggregatePendingSqlChangeType(targets),
        sqlText: buildPendingSqlSummary(targets),
        targets: targets.map(target => ({
          targetKey: target.targetKey,
          datasourceId: target.datasourceId,
          targetEnvironment: target.targetEnvironment,
          changeType: target.changeType,
          sqlText: target.sqlText,
        })),
      })
      setRegistration(saved)
      setTargets(saved.targets)
      setActiveTargetKey(current => saved.targets.some(target => target.targetKey === current)
        ? current : (saved.targets[0]?.targetKey ?? ''))
      onChanged?.(saved)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  const handleCopyAll = async () => {
    const sqlText = buildPendingSqlSummary(targets)
    if (!sqlText) return
    try {
      await navigator.clipboard.writeText(sqlText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      setError('复制失败，请在 SQL 查看器中手动选择复制')
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
      setTargets([])
      setActiveTargetKey('')
      onChanged?.(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3" onClick={onClose}>
      <div className="flex h-[88vh] max-h-[920px] w-full max-w-6xl flex-col overflow-hidden rounded-xl border bg-[var(--color-card)] shadow-2xl" onClick={event => event.stopPropagation()}>
        <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3 sm:px-5">
          <Database className="size-4 shrink-0 text-[var(--color-primary)]" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold">SQL 管理</h2>
            {registration && <p className="mt-0.5 text-[10px] tabular-nums text-[var(--color-muted-foreground)]">登记于 {formatTimestamp(registration.createdAt)}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]" aria-label="关闭">
            <X className="size-4" />
          </button>
        </header>

        {registration === undefined ? (
          <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-sm text-[var(--color-muted-foreground)]">
            <Loader2 className="size-4 animate-spin" />加载 SQL…
          </div>
        ) : registration === null ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <p className="text-sm font-medium">当前会话没有 SQL 登记</p>
            <p className="text-xs text-[var(--color-muted-foreground)]">由 Agent 登记 SQL 后，可在这里审阅和修改。</p>
          </div>
        ) : (
          <>
            {targets.length > 1 && (
              <nav aria-label="选择 SQL 脚本" className="scrollbar-autohide flex shrink-0 gap-1 overflow-x-auto border-b px-4 py-2 sm:px-5">
                {targets.map((target, index) => (
                  <button key={target.targetKey} type="button" onClick={() => setActiveTargetKey(target.targetKey)} title={target.targetEnvironment}
                    className={cn('shrink-0 rounded px-2.5 py-1.5 text-xs', activeTarget?.targetKey === target.targetKey ? 'bg-[var(--color-accent)] font-medium text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]')}>
                    SQL {index + 1}
                  </button>
                ))}
              </nav>
            )}
            <main className="flex min-h-0 flex-1 p-3 sm:p-4">
              {activeTarget ? (
                <Suspense fallback={<SqlWorkspaceLoading />}>
                  <PendingSqlReviewWorkspace sqlText={activeTarget.sqlText} onSqlTextChange={updateActiveSql} onError={setError} expanded />
                </Suspense>
              ) : (
                <div className="flex flex-1 items-center justify-center text-xs text-[var(--color-muted-foreground)]">当前登记没有 SQL 内容。</div>
              )}
            </main>
            {error && <p role="alert" className="shrink-0 border-t px-4 py-2 text-xs text-[var(--color-destructive)] sm:px-5">{error}</p>}
          </>
        )}

        {registration !== undefined && registration !== null && (
          <footer className="flex shrink-0 items-center gap-2 border-t px-4 py-3 sm:px-5">
            <button type="button" onClick={handleDelete} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md px-2 py-2 text-xs text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10 disabled:opacity-50">
              <Trash2 className="size-3.5" />解除登记
            </button>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={handleCopyAll} disabled={targets.length === 0} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs disabled:opacity-50">
                {copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}{copied ? '已复制' : '复制 SQL'}
              </button>
              <button type="button" onClick={handleSave} disabled={busy || targets.length === 0 || targets.some(target => !target.sqlText.trim())} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-4 py-2 text-xs font-medium text-[var(--color-primary-foreground)] disabled:opacity-50">
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}保存
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  )
}

function formatTimestamp(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(value)
}

function SqlWorkspaceLoading() {
  return (
    <div className="flex flex-1 items-center justify-center gap-2 text-xs text-[var(--color-muted-foreground)]">
      <Loader2 className="size-4 animate-spin" />加载 SQL 编辑器…
    </div>
  )
}
