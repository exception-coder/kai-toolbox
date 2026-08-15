import { useEffect, useState, type ReactNode } from 'react'
import { ClipboardCheck, Copy, GitBranch, Loader2, X } from 'lucide-react'
import { MarkdownContent } from '@/components/markdown/MarkdownContent'
import {
  getDevDocVersionContent,
  getProgressVersionContent,
  listDevDocVersions,
  listProgressVersions,
} from '../../api'
import type { DevDocVersionSummary, ProgressVersionSummary } from '../../types'

interface HistorySheetProps {
  sessionId: string
  onViewVersion: (version: number, isCurrent: boolean) => void
  onClose: () => void
}

const DEV_DOC_MODE_LABEL: Record<
  'generate' | 'regenerate' | 'update',
  { label: string; color: string; bg: string }
> = {
  generate: { label: '首次生成', color: 'text-purple-400', bg: 'bg-purple-500/15 border-purple-500/20' },
  regenerate: { label: '重新生成', color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/20' },
  update: { label: '更新版本', color: 'text-amber-500', bg: 'bg-amber-500/15 border-amber-500/20' },
}

const DEV_DOC_MODE_UNKNOWN = {
  label: '历史版本',
  color: 'text-[var(--color-muted-foreground)]',
  bg: 'bg-[var(--color-muted)]/40 border-[var(--color-border)]',
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      aria-label="关闭"
      onClick={onClose}
      className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
    >
      <X className="w-4 h-4" />
    </button>
  )
}

function HistorySheetFrame({
  titleId,
  header,
  children,
  footer,
  onClose,
}: {
  titleId: string
  header: ReactNode
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="relative w-full max-w-md bg-[var(--color-card)] border-l border-[var(--color-border)] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          {header}
          <CloseButton onClose={onClose} />
        </div>
        {children}
        {footer}
      </div>
    </div>
  )
}

export function DevDocHistorySheet({ sessionId, onViewVersion, onClose }: HistorySheetProps) {
  const [versions, setVersions] = useState<DevDocVersionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listDevDocVersions(sessionId)
      .then((list) => { if (!cancelled) setVersions(list) })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : '加载失败') })
    return () => { cancelled = true }
  }, [sessionId])

  return (
    <HistorySheetFrame
      titleId="dev-doc-history-title"
      onClose={onClose}
      header={(
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-purple-400" />
          <span id="dev-doc-history-title" className="font-semibold text-sm">开发文档生成记录</span>
          {versions && <span className="text-xs text-[var(--color-muted-foreground)]">（共 {versions.length} 版）</span>}
        </div>
      )}
      footer={(
        <div className="px-5 py-3 border-t border-[var(--color-border)] text-xs text-[var(--color-muted-foreground)]">
          点「查看此版本文档内容」可预览任意历史版本的完整文档
        </div>
      )}
    >
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {error ? (
          <p className="text-sm text-red-500">加载失败：{error}</p>
        ) : versions === null ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
            <Loader2 className="w-4 h-4 animate-spin" /> 加载中…
          </div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)] italic">暂无生成记录</p>
        ) : (
          versions.map((entry) => <DevDocVersionCard key={entry.version} entry={entry} onViewVersion={onViewVersion} />)
        )}
      </div>
    </HistorySheetFrame>
  )
}

function DevDocVersionCard({
  entry,
  onViewVersion,
}: {
  entry: DevDocVersionSummary
  onViewVersion: HistorySheetProps['onViewVersion']
}) {
  const mode = entry.mode ? DEV_DOC_MODE_LABEL[entry.mode] : DEV_DOC_MODE_UNKNOWN

  return (
    <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[var(--color-muted)]/30">
        <div className="flex items-center gap-2">
          <span className="w-6 h-5 rounded-full bg-[var(--color-primary)]/15 flex items-center justify-center text-[10px] font-semibold text-[var(--color-primary)]">
            v{entry.version}
          </span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded border leading-tight ${mode.bg} ${mode.color}`}>
            {mode.label}
          </span>
          {entry.isCurrent && (
            <span className="text-[9px] px-1 rounded bg-green-500/15 text-green-500 border border-green-500/20 leading-tight">当前</span>
          )}
        </div>
        {entry.generatedAt && (
          <span className="text-[11px] text-[var(--color-muted-foreground)]">
            {new Date(entry.generatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
      <div className="p-3 text-sm leading-relaxed">
        {entry.mode === null ? (
          <span className="text-[var(--color-muted-foreground)] italic">
            （这版早于生成记录功能上线，无补充说明记录，但可以查看当时的文档内容）
          </span>
        ) : (
          <>
            {entry.extraInstructions ? (
              <p className="whitespace-pre-wrap">{entry.extraInstructions}</p>
            ) : entry.qaHistory.length === 0 ? (
              <p className="text-[var(--color-muted-foreground)] italic">（未填写补充说明）</p>
            ) : null}
            {entry.qaHistory.length > 0 && (
              <div className="space-y-1.5 mt-2">
                <div className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide">
                  本版澄清问答（{entry.qaHistory.length} 轮）
                </div>
                {entry.qaHistory.map((qa, index) => (
                  <div key={index} className="rounded-lg border border-[var(--color-border)]/60 overflow-hidden">
                    <div className="flex items-start gap-1.5 px-2 py-1.5 bg-[var(--color-muted)]/20 text-xs">
                      <span className="text-[var(--color-primary)] font-semibold flex-shrink-0">Q{index + 1}</span>
                      <span>{qa.question}</span>
                    </div>
                    <div className="flex items-start gap-1.5 px-2 py-1.5 text-xs text-[var(--color-muted-foreground)]">
                      <span className="flex-shrink-0">A</span>
                      <span>{qa.answer}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <div className="px-3 pb-2.5">
        <button type="button" onClick={() => onViewVersion(entry.version, entry.isCurrent)} className="text-xs text-purple-400 hover:underline">
          查看此版本文档内容 →
        </button>
      </div>
    </div>
  )
}

export function ProgressHistorySheet({ sessionId, onViewVersion, onClose }: HistorySheetProps) {
  const [versions, setVersions] = useState<ProgressVersionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listProgressVersions(sessionId)
      .then((list) => { if (!cancelled) setVersions(list) })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : '加载失败') })
    return () => { cancelled = true }
  }, [sessionId])

  return (
    <HistorySheetFrame
      titleId="progress-history-title"
      onClose={onClose}
      header={(
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-blue-400" />
          <span id="progress-history-title" className="font-semibold text-sm">进度评估记录</span>
          {versions && <span className="text-xs text-[var(--color-muted-foreground)]">（共 {versions.length} 次）</span>}
        </div>
      )}
    >
      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {error ? (
          <p className="text-sm text-red-500">加载失败：{error}</p>
        ) : versions === null ? (
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
            <Loader2 className="w-4 h-4 animate-spin" /> 加载中…
          </div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-foreground)] italic">暂无评估记录</p>
        ) : (
          versions.map((entry) => (
            <div key={entry.version} className="rounded-xl border border-[var(--color-border)] overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[var(--color-muted)]/30">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-5 rounded-full bg-blue-500/15 flex items-center justify-center text-[10px] font-semibold text-blue-400">v{entry.version}</span>
                  {entry.isCurrent && (
                    <span className="text-[9px] px-1 rounded bg-green-500/15 text-green-500 border border-green-500/20 leading-tight">最新</span>
                  )}
                </div>
                {entry.generatedAt && (
                  <span className="text-[11px] text-[var(--color-muted-foreground)]">
                    {new Date(entry.generatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              {entry.extraContext && (
                <div className="px-3 py-2 text-xs text-[var(--color-muted-foreground)]">核对重点：{entry.extraContext}</div>
              )}
              <div className="px-3 pb-2.5">
                <button type="button" onClick={() => onViewVersion(entry.version, entry.isCurrent)} className="text-xs text-blue-400 hover:underline">
                  查看这次评估的报告 →
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </HistorySheetFrame>
  )
}

interface VersionViewDialogProps {
  sessionId: string
  version: number
  isLatest: boolean
  onClose: () => void
}

function VersionViewDialog({
  sessionId,
  title,
  currentLabel,
  accent,
  loadContent,
  version,
  isLatest,
  onClose,
}: VersionViewDialogProps & {
  title: string
  currentLabel: string
  accent: 'purple' | 'blue'
  loadContent: (sessionId: string, version: number) => Promise<string>
}) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setContent(null)
    setError(null)
    loadContent(sessionId, version)
      .then((value) => { if (!cancelled) setContent(value) })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : '加载失败') })
    return () => { cancelled = true }
  }, [loadContent, sessionId, version])

  const titleId = `${accent}-version-view-title`
  const Icon = accent === 'purple' ? GitBranch : ClipboardCheck

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-3xl h-[85vh] rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Icon className={`w-4 h-4 ${accent === 'purple' ? 'text-purple-400' : 'text-blue-400'}`} />
            <span id={titleId} className="font-semibold text-sm">{title} v{version}</span>
            {isLatest && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-500 border border-green-500/20 leading-tight">{currentLabel}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {content && (
              <button type="button" onClick={() => navigator.clipboard.writeText(content)} className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                <Copy className="w-3 h-3" /> 复制
              </button>
            )}
            <CloseButton onClose={onClose} />
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {error ? (
            <div className="h-full flex items-center justify-center text-sm text-red-500">加载失败：{error}</div>
          ) : content === null ? (
            <div className="h-full flex items-center justify-center text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> 加载中…
            </div>
          ) : content ? (
            <MarkdownContent content={content} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-[var(--color-muted-foreground)] italic">该版本内容不存在（可能已被清理）</div>
          )}
        </div>
      </div>
    </div>
  )
}

export function DevDocVersionViewDialog(props: VersionViewDialogProps) {
  return (
    <VersionViewDialog
      {...props}
      title="开发文档"
      currentLabel="当前版本"
      accent="purple"
      loadContent={getDevDocVersionContent}
    />
  )
}

export function ProgressVersionViewDialog(props: VersionViewDialogProps) {
  return (
    <VersionViewDialog
      {...props}
      title="进度评估"
      currentLabel="最新"
      accent="blue"
      loadContent={getProgressVersionContent}
    />
  )
}
