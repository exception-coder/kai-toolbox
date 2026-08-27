import { useEffect, useMemo, useState } from 'react'
import { Check, Clipboard, ExternalLink, FileText, Loader2, RefreshCw, Settings2 } from 'lucide-react'
import { MarkdownContent } from '@/components/markdown/MarkdownContent'
import {
  getContent,
  getDevDocContent,
  getInitialSpecContent,
  type PrdSessionView,
} from '@/features/prd-clarify/public-api'
import { cn } from '@/lib/utils'

type DocumentKind = 'specification' | 'initial' | 'tdd'

interface DocumentOption {
  kind: DocumentKind
  label: string
  path: string
  load: (sessionId: string) => Promise<string>
}

interface Props {
  session: PrdSessionView
  onManage: () => void
  onOpenSource: () => void
}

/** 会话绑定文档的常驻阅读工作区；关联、解除和变更分析仍交给原管理面板。 */
export function SessionDocumentsWorkspace({ session, onManage, onOpenSource }: Props) {
  const documents = useMemo<DocumentOption[]>(() => [
    session.mdPath ? { kind: 'specification', label: '核心规格', path: session.mdPath, load: getContent } : null,
    session.initialSpecPath ? { kind: 'initial', label: '初始化规格', path: session.initialSpecPath, load: getInitialSpecContent } : null,
    session.devDocPath ? { kind: 'tdd', label: 'TDD / 执行计划', path: session.devDocPath, load: getDevDocContent } : null,
  ].filter((item): item is DocumentOption => item !== null), [session.devDocPath, session.initialSpecPath, session.mdPath])
  const [activeKind, setActiveKind] = useState<DocumentKind | null>(documents[0]?.kind ?? null)
  const [contents, setContents] = useState<Partial<Record<DocumentKind, string>>>({})
  const [loadingKind, setLoadingKind] = useState<DocumentKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const active = documents.find(document => document.kind === activeKind) ?? documents[0]

  useEffect(() => {
    setActiveKind(documents[0]?.kind ?? null)
    setContents({})
    setError(null)
  }, [session.id])

  useEffect(() => {
    if (!active || contents[active.kind] !== undefined) return
    let alive = true
    setLoadingKind(active.kind)
    setError(null)
    active.load(session.id)
      .then(content => {
        if (alive) setContents(current => ({ ...current, [active.kind]: content }))
      })
      .catch(reason => {
        if (alive) setError(reason instanceof Error ? reason.message : '读取文档失败')
      })
      .finally(() => {
        if (alive) setLoadingKind(current => current === active.kind ? null : current)
      })
    return () => { alive = false }
  }, [active, contents, session.id])

  const reload = () => {
    if (!active) return
    setContents(current => {
      const next = { ...current }
      delete next[active.kind]
      return next
    })
  }

  const copyCurrent = async () => {
    if (!active) return
    const content = contents[active.kind]
    if (!content) return
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      setError('复制失败，请在正文中手动选择复制')
    }
  }

  return (
    <section className="cc-skin-view flex min-h-0 flex-1 flex-col bg-[var(--color-background)]">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <FileText className="size-4 shrink-0 text-[var(--color-primary)]" />
            <h2 className="truncate text-sm font-semibold" title={session.title}>{session.title || '未命名规格'}</h2>
          </div>
          <p className="mt-1 truncate text-[11px] text-[var(--color-muted-foreground)]">
            {[session.project, session.module].filter(Boolean).join(' / ') || '当前会话绑定文档'}
          </p>
        </div>
        <button type="button" onClick={onOpenSource} className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]">
          <ExternalLink className="size-3.5" />规格探索
        </button>
        <button type="button" onClick={onManage} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 text-xs hover:bg-[var(--color-accent)]">
          <Settings2 className="size-3.5" />管理关联与同步
        </button>
      </header>

      {documents.length > 0 ? (
        <>
          <div className="scrollbar-autohide flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[var(--color-border)] px-4">
            {documents.map(document => (
              <button
                key={document.kind}
                type="button"
                onClick={() => { setActiveKind(document.kind); setError(null) }}
                className={cn(
                  'relative h-10 shrink-0 px-2 text-xs transition-colors after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full',
                  active?.kind === document.kind
                    ? 'font-medium text-[var(--color-primary)] after:bg-[var(--color-primary)]'
                    : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] after:bg-transparent',
                )}
              >
                {document.label}
              </button>
            ))}
            {active && (
              <span className="ml-auto hidden max-w-[38vw] truncate pl-4 font-mono text-[10px] text-[var(--color-muted-foreground)] lg:block" title={active.path}>
                {active.path}
              </span>
            )}
            <button type="button" onClick={reload} className="ml-1 rounded-md p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]" title="重新读取当前文档">
              <RefreshCw className="size-3.5" />
            </button>
            <button type="button" onClick={() => void copyCurrent()} disabled={!active || !contents[active.kind]} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] disabled:opacity-40">
              {copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}{copied ? '已复制' : '复制正文'}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingKind === active?.kind ? (
              <div className="flex h-full min-h-64 items-center justify-center gap-2 text-sm text-[var(--color-muted-foreground)]">
                <Loader2 className="size-4 animate-spin" />正在读取{active.label}…
              </div>
            ) : error ? (
              <div className="mx-auto max-w-3xl px-6 py-12">
                <h3 className="text-sm font-semibold">文档暂时无法读取</h3>
                <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">{error}</p>
                <button type="button" onClick={reload} className="mt-4 inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs hover:bg-[var(--color-accent)]">
                  <RefreshCw className="size-3.5" />重新读取
                </button>
              </div>
            ) : active && contents[active.kind] ? (
              <MarkdownContent content={contents[active.kind] ?? ''} className="mx-auto max-w-5xl px-5 py-6 sm:px-8" />
            ) : (
              <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-[var(--color-muted-foreground)]">当前文档没有可展示的正文。</div>
            )}
          </div>
        </>
      ) : (
        <div className="mx-auto max-w-3xl px-6 py-12">
          <h3 className="text-sm font-semibold">绑定已建立，文档尚未生成</h3>
          <p className="mt-2 text-sm text-[var(--color-muted-foreground)]">可前往规格探索生成核心规格或执行计划，生成后会自动出现在这里。</p>
          <button type="button" onClick={onOpenSource} className="mt-4 inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs hover:bg-[var(--color-accent)]">
            <ExternalLink className="size-3.5" />打开规格探索
          </button>
        </div>
      )}
    </section>
  )
}
