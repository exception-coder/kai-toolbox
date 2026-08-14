import { lazy, Suspense, useEffect, useState } from 'react'
import {
  AlertTriangle, Check, CheckCircle2, ChevronDown, Clipboard, Database, Loader2,
  Maximize2, Minimize2, Save, Trash2, X,
} from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import {
  deleteSessionPendingSql,
  getSessionPendingSql,
  saveSessionPendingSql,
  updateSessionPendingSqlStatus,
} from '../api'
import type { DdlEvidenceStatus, PendingSqlChangeType, PendingSqlStatus, SessionPendingSql } from '../types'

const PendingSqlReviewWorkspace = lazy(() => import('./PendingSqlReviewWorkspace').then(module => ({
  default: module.PendingSqlReviewWorkspace,
})))

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

const STATUS_TONES: Record<PendingSqlStatus, string> = {
  PENDING: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  EXECUTED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELLED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}

const DDL_STATUS: Record<DdlEvidenceStatus, { label: string; detail: string; tone: string }> = {
  VERIFIED: {
    label: 'DDL 已核验',
    detail: 'SQL 涉及的目标表已在当前项目知识库中完整命中。',
    tone: 'border-emerald-300/60 bg-emerald-50/70 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/35 dark:text-emerald-300',
  },
  PARTIAL: {
    label: 'DDL 部分命中',
    detail: '部分目标表未在知识库命中，未命中部分必须人工复核。',
    tone: 'border-amber-300/60 bg-amber-50/70 text-amber-800 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-300',
  },
  DDL_MISSING: {
    label: 'DDL 未核验 · 缺少基线',
    detail: '当前项目没有可用 DDL 基线；已作为待复核草稿登记，执行前请人工确认字段。',
    tone: 'border-amber-300/60 bg-amber-50/70 text-amber-800 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-300',
  },
  PROJECT_AMBIGUOUS: {
    label: 'DDL 未核验 · 项目归属不明',
    detail: '当前工作区关联多个项目，尚未确认应使用哪一份 DDL；登记不受影响，执行前请人工复核。',
    tone: 'border-amber-300/60 bg-amber-50/70 text-amber-800 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-300',
  },
  STALE: {
    label: 'DDL 基线已过期',
    detail: '知识库已标记过期，本 SQL 需要结合真实库结构再次复核。',
    tone: 'border-amber-300/60 bg-amber-50/70 text-amber-800 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-300',
  },
  NOT_CHECKED: {
    label: 'DDL 未核验',
    detail: '未识别出目标表或尚未完成知识库核验，请勿直接执行。',
    tone: 'border-slate-300/60 bg-slate-50/70 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300',
  },
}

/** 会话级待执行 SQL 审阅面板；只维护本地台账，不提供执行入口。 */
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (isFullscreen) setIsFullscreen(false)
      else onClose()
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
        title: title.trim(), targetEnvironment: targetEnvironment.trim(), changeType, sqlText,
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

  const handleCopyAll = async () => {
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
      className={cn('fixed inset-0 z-50 flex justify-center bg-black/40', isFullscreen ? 'items-stretch p-0' : 'items-center p-3')}
      onClick={onClose}
    >
      <div
        className={cn(
          'flex w-full flex-col overflow-hidden bg-[var(--color-card)] shadow-2xl',
          isFullscreen ? 'h-[100dvh] max-w-none rounded-none' : 'h-[88vh] max-h-[920px] max-w-6xl rounded-xl border',
        )}
        onClick={event => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
          <Database className="size-4 text-[var(--color-primary)]" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">待执行 SQL</span>
          {registration && <span className={cn('rounded-full px-2 py-0.5 text-[11px]', STATUS_TONES[registration.status])}>{STATUS_LABELS[registration.status]}</span>}
          <button type="button" onClick={() => setIsFullscreen(value => !value)} className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]" title={isFullscreen ? '退出全屏' : '全屏查看'}>
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]" aria-label="关闭">
            <X className="size-3.5" />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <div className="flex min-h-full flex-col gap-3">
            <div className="flex items-center gap-2 rounded-md border border-amber-300/60 bg-amber-50/70 px-3 py-1.5 text-[11px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>仅登记和复制 SQL，不会自动连接或执行数据库。请勿填写密码或 Token。</span>
            </div>

            {registration === undefined ? (
              <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[var(--color-muted-foreground)]">
                <Loader2 className="size-4 animate-spin" />加载登记信息…
              </div>
            ) : (
              <>
                {registration && <DdlEvidenceSummary registration={registration} />}
                <div className="grid shrink-0 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.42fr)_180px]">
                  <label className="space-y-1 text-xs font-medium sm:col-span-2 lg:col-span-1">
                    <span>登记标题</span>
                    <input value={title} onChange={event => setTitle(event.target.value)} placeholder="例如：新增报价有效期字段" className="h-9 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm outline-none focus:border-[var(--color-primary)]" />
                  </label>
                  <label className="space-y-1 text-xs font-medium">
                    <span>目标库 / 环境</span>
                    <input value={targetEnvironment} onChange={event => setTargetEnvironment(event.target.value)} placeholder="例如：SRM 测试库" className="h-9 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm outline-none focus:border-[var(--color-primary)]" />
                  </label>
                  <label className="space-y-1 text-xs font-medium">
                    <span>变更类型</span>
                    <select value={changeType} onChange={event => setChangeType(event.target.value as PendingSqlChangeType)} className="h-9 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm outline-none focus:border-[var(--color-primary)]">
                      <option value="DDL">DDL · 表结构</option>
                      <option value="DML">DML · 数据变更</option>
                      <option value="MIXED">混合 SQL</option>
                    </select>
                  </label>
                </div>
                {registration && (
                  <p className="-mt-1 shrink-0 text-[11px] text-[var(--color-muted-foreground)]">
                    登记时间 {formatTimestamp(registration.createdAt)} · 最后更新 {formatTimestamp(registration.updatedAt)}
                  </p>
                )}

                <Suspense fallback={<SqlWorkspaceLoading />}>
                  <PendingSqlReviewWorkspace sqlText={sqlText} onSqlTextChange={setSqlText} onError={setError} expanded={isFullscreen} />
                </Suspense>
                {error && <p className="shrink-0 text-xs text-[var(--color-destructive)]">{error}</p>}
              </>
            )}
          </div>
        </main>

        {registration !== undefined && (
          <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t bg-[var(--color-card)] px-4 py-3">
            {registration && (
              <button type="button" onClick={handleDelete} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md px-2 py-2 text-xs text-[var(--color-destructive)] hover:bg-[var(--color-destructive)]/10 disabled:opacity-50">
                <Trash2 className="size-3.5" />解除关联
              </button>
            )}
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={handleCopyAll} disabled={!sqlText} className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs disabled:opacity-50">
                {copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}{copied ? '已复制全部' : '复制全部 SQL'}
              </button>
              {registration && <StatusActions registration={registration} busy={busy} onStatus={handleStatus} />}
              <button type="button" onClick={handleSave} disabled={busy || !sqlText.trim()} className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-4 py-2 text-xs font-medium text-[var(--color-primary-foreground)] disabled:opacity-50">
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}{registration ? '保存修改' : '保存登记'}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  )
}

function DdlEvidenceSummary({ registration }: { registration: SessionPendingSql }) {
  const evidenceStatus = registration.ddlEvidenceStatus ?? 'NOT_CHECKED'
  const config = DDL_STATUS[evidenceStatus]
  const verified = registration.ddlVerifiedTables ?? []
  const missing = registration.ddlMissingTables ?? []
  return (
    <details className={cn('group shrink-0 rounded-lg border px-3 py-2 text-xs', config.tone)}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 font-semibold">
        {evidenceStatus === 'VERIFIED' ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
        <span>{config.label}</span>
        {registration.ddlProject && <span className="font-normal opacity-80">· {registration.ddlProject}</span>}
        <span className="ml-auto font-normal opacity-70">查看证据</span>
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-2 space-y-1 border-t border-current/15 pt-2 opacity-90">
        <p>{config.detail}</p>
        {verified.length > 0 && <p className="break-all">已核验：{verified.join('、')}</p>}
        {missing.length > 0 && <p className="break-all font-medium">未命中：{missing.join('、')}</p>}
        {registration.ddlBaselinePath && <p className="truncate opacity-70" title={registration.ddlBaselinePath}>基线：{registration.ddlBaselinePath}</p>}
      </div>
    </details>
  )
}

function StatusActions({ registration, busy, onStatus }: {
  registration: SessionPendingSql
  busy: boolean
  onStatus: (status: PendingSqlStatus) => void
}) {
  return (
    <details className="group relative">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-md border px-3 py-2 text-xs">
        更多操作<ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute bottom-full right-0 z-20 mb-2 w-44 rounded-lg border bg-[var(--color-popover)] p-1 shadow-xl">
        {registration.status !== 'EXECUTED' && <StatusButton disabled={busy} onClick={() => onStatus('EXECUTED')}>标记为已执行</StatusButton>}
        {registration.status !== 'CANCELLED' && <StatusButton disabled={busy} onClick={() => onStatus('CANCELLED')}>标记为已取消</StatusButton>}
        {registration.status !== 'PENDING' && <StatusButton disabled={busy} onClick={() => onStatus('PENDING')}>恢复为待执行</StatusButton>}
      </div>
    </details>
  )
}

function StatusButton({ children, disabled, onClick }: { children: string; disabled: boolean; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className="block w-full rounded-md px-3 py-2 text-left text-xs hover:bg-[var(--color-accent)] disabled:opacity-50">{children}</button>
}

function formatTimestamp(value: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(value)
}

function SqlWorkspaceLoading() {
  return (
    <div className="flex h-[440px] items-center justify-center gap-2 rounded-xl border text-xs text-[var(--color-muted-foreground)]">
      <Loader2 className="size-4 animate-spin" />加载 SQL 审阅器…
    </div>
  )
}
