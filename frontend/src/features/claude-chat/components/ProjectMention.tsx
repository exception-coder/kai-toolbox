import { useCallback, useEffect, useMemo, useState, type KeyboardEvent, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AtSign, FileText, Folder, Loader2 } from 'lucide-react'
import { listSessions as listPrdSessions } from '@/features/prd-clarify/api'
import type { PrdSessionView } from '@/features/prd-clarify/types'
import { cn } from '@/lib/utils'
import { listWorkspaces } from '../api'
import type { WorkspaceDir } from '../types'

type DraftSetter = (value: string | ((current: string) => string)) => void

interface MentionTrigger {
  start: number
  end: number
  query: string
}

interface ProjectReference extends WorkspaceDir {
  kind: 'project'
  key: string
}

interface PrdReference {
  kind: 'prd'
  key: string
  name: string
  detail: string
  session: PrdSessionView
}

type ReferenceOption = ProjectReference | PrdReference

interface ProjectMentionMenuProps {
  open: boolean
  references: ReferenceOption[]
  activeIndex: number
  loading: boolean
  warning: string | null
  actionError: string | null
  busyKey: string | null
  className?: string
  onPick: (reference: ReferenceOption) => void
}

interface ProjectMentionOptions {
  enabled?: boolean
  onPickPrd: (session: PrdSessionView) => Promise<void>
}

interface MentionEditorOptions {
  value: string
  setValue: DraftSetter
  textareaRef: RefObject<HTMLTextAreaElement | null>
  enabled: boolean
  trigger: MentionTrigger | null
  busy: boolean
  setTrigger: (trigger: MentionTrigger | null) => void
}

interface ReferenceKeyboardOptions {
  open: boolean
  busy: boolean
  references: ReferenceOption[]
  activeIndex: number
  setActiveIndex: (value: number | ((current: number) => number)) => void
  close: () => void
  pickReference: (reference: ReferenceOption) => Promise<void>
}

/** 将工作区扫描结果整理为可检索的唯一项目目录。 */
function flattenProjects(roots: { root: string; exists: boolean; dirs: WorkspaceDir[] }[]): ProjectReference[] {
  const seen = new Set<string>()
  const projects: ProjectReference[] = []
  for (const root of roots) {
    if (!root.exists) continue
    for (const dir of root.dirs) {
      const key = dir.path.replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      projects.push({ ...dir, kind: 'project', key: `project:${key}` })
    }
  }
  return projects.sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
}

/** 仅保留已生成正式文档的 PRD，并整理搜索展示信息。 */
function flattenPrds(sessions: PrdSessionView[]): PrdReference[] {
  return sessions
    .filter(session => Boolean(session.mdPath || session.devDocPath))
    .map(session => ({
      kind: 'prd' as const,
      key: `prd:${session.id}`,
      name: session.title || '（未命名 PRD）',
      detail: [session.project, session.module].filter(Boolean).join(' / ') || 'PRD 澄清助手',
      session,
    }))
    .sort((left, right) => right.session.updatedAt - left.session.updatedAt)
}

/** 交错合并两类引用，避免任一类型数量较多时独占菜单首屏。 */
function interleaveReferences(
  projects: ProjectReference[],
  prds: PrdReference[],
): ReferenceOption[] {
  const references: ReferenceOption[] = []
  const length = Math.max(projects.length, prds.length)
  for (let index = 0; index < length; index += 1) {
    if (projects[index]) references.push(projects[index])
    if (prds[index]) references.push(prds[index])
  }
  return references
}

/** 识别光标前正在输入的引用，不匹配邮箱和已有反引号路径。 */
function findTypingTrigger(value: string, cursor: number): MentionTrigger | null {
  // @ 引用只可能出现在光标附近，无需在每次输入/退格时扫描整份长草稿。
  const scanStart = Math.max(0, cursor - 512)
  const prefix = value.slice(scanStart, cursor)
  const match = /(^|\s)@([^\s@`]*)$/.exec(prefix)
  if (!match) return null
  const start = scanStart + (match.index ?? 0) + match[1].length
  return { start, end: cursor, query: match[2] }
}

/** 生成所有代码引擎均可理解、且能安全容纳空格的可见项目引用。 */
function formatProjectMention(path: string): string {
  return `@\`${path}\``
}

/** 统一引用搜索菜单，鼠标按下时选择以避免 textarea 先丢失光标。 */
export function ProjectMentionMenu({
  open,
  references,
  activeIndex,
  loading,
  warning,
  actionError,
  busyKey,
  className,
  onPick,
}: ProjectMentionMenuProps) {
  if (!open) return null
  return (
    <div className={cn('max-h-64 overflow-y-auto rounded-xl border bg-[var(--color-card)] p-1.5 shadow-lg', className)}>
      {loading && references.length === 0 && (
        <div className="flex items-center gap-2 px-3 py-4 text-sm text-[var(--color-muted-foreground)]">
          <Loader2 className="size-4 animate-spin" />
          正在加载项目和 PRD…
        </div>
      )}
      {warning && <div className="px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">{warning}</div>}
      {actionError && <div className="px-3 py-1.5 text-xs text-[var(--color-destructive)]">{actionError}</div>}
      {!loading && references.length === 0 && (
        <div className="px-3 py-4 text-sm text-[var(--color-muted-foreground)]">暂无匹配的项目或 PRD</div>
      )}
      {references.map((reference, index) => {
        const isPrd = reference.kind === 'prd'
        const busy = busyKey === reference.key
        const detail = isPrd ? reference.detail : reference.path
        return (
          <button
            key={reference.key}
            type="button"
            disabled={busyKey !== null}
            aria-selected={index === activeIndex}
            onMouseDown={event => {
              event.preventDefault()
              onPick(reference)
            }}
            className={cn(
              'flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left disabled:opacity-60',
              index === activeIndex ? 'bg-[var(--color-accent)]' : 'hover:bg-[var(--color-accent)]',
            )}
          >
            {busy
              ? <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-[var(--color-primary)]" />
              : isPrd
                ? <FileText className="mt-0.5 size-4 shrink-0 text-violet-500" />
                : <Folder className="mt-0.5 size-4 shrink-0 text-[var(--color-primary)]" />}
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{reference.name}</span>
                <span className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium',
                  isPrd
                    ? 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
                )}>
                  {isPrd ? 'PRD' : '项目'}
                </span>
              </span>
              <span className="block truncate text-xs text-[var(--color-muted-foreground)]">{detail}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** 并行查询两类引用数据，并对当前搜索词生成统一结果。 */
function useReferenceCatalog(open: boolean, query: string) {
  const workspaceQuery = useQuery({
    queryKey: ['claude-chat-workspaces'],
    queryFn: listWorkspaces,
    enabled: open,
    staleTime: 30_000,
  })
  const prdQuery = useQuery({
    queryKey: ['prd-clarify-sessions'],
    queryFn: listPrdSessions,
    enabled: open,
    staleTime: 30_000,
  })
  const allReferences = useMemo<ReferenceOption[]>(() => interleaveReferences(
    flattenProjects(workspaceQuery.data?.roots ?? []),
    flattenPrds(prdQuery.data ?? []),
  ), [prdQuery.data, workspaceQuery.data])
  const references = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return allReferences
    return allReferences.filter(reference => {
      const searchable = reference.kind === 'project'
        ? `${reference.name} ${reference.path}`
        : `${reference.name} ${reference.detail}`
      return searchable.toLowerCase().includes(normalizedQuery)
    })
  }, [allReferences, query])
  const failedSources: string[] = []
  if (workspaceQuery.isError) failedSources.push('项目')
  if (prdQuery.isError) failedSources.push('PRD')
  return {
    references,
    loading: workspaceQuery.isLoading || prdQuery.isLoading,
    warning: failedSources.length > 0 ? `${failedSources.join('、')}列表加载失败，已展示其余可用结果` : null,
  }
}

/** 封装触发字符插入和引用片段替换，保持光标行为与数据类型无关。 */
function useMentionEditor({
  value,
  setValue,
  textareaRef,
  enabled,
  trigger,
  busy,
  setTrigger,
}: MentionEditorOptions) {
  const handleChange = useCallback((nextValue: string, cursor: number) => {
    setValue(nextValue)
    setTrigger(enabled ? findTypingTrigger(nextValue, cursor) : null)
  }, [enabled, setTrigger, setValue])

  const togglePicker = useCallback(() => {
    if (!enabled || busy) return
    if (trigger) {
      setTrigger(null)
      return
    }
    const textarea = textareaRef.current
    const selectionStart = textarea?.selectionStart ?? value.length
    const selectionEnd = textarea?.selectionEnd ?? selectionStart
    const before = value.slice(0, selectionStart)
    const after = value.slice(selectionEnd)
    const leading = before && !/\s$/.test(before) ? ' ' : ''
    const trailing = after && !/^\s/.test(after) ? ' ' : ''
    const start = before.length + leading.length
    const cursor = start + 1
    setValue(`${before}${leading}@${trailing}${after}`)
    setTrigger({ start, end: cursor, query: '' })
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(cursor, cursor)
    })
  }, [busy, enabled, setTrigger, setValue, textareaRef, trigger, value])

  const replaceTrigger = useCallback((mention: string) => {
    if (!trigger) return
    const before = value.slice(0, trigger.start)
    const after = value.slice(trigger.end)
    const leading = before && !/\s$/.test(before) ? ' ' : ''
    const trailing = after && !/^\s/.test(after) ? ' ' : after ? '' : ' '
    const nextValue = `${before}${leading}${mention}${trailing}${after}`
    const cursor = before.length + leading.length + mention.length + trailing.length
    setValue(nextValue)
    setTrigger(null)
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      textarea?.focus()
      textarea?.setSelectionRange(cursor, cursor)
    })
  }, [setTrigger, setValue, textareaRef, trigger, value])

  return { handleChange, togglePicker, replaceTrigger }
}

/** 统一消费引用菜单的方向键、确认键和关闭键。 */
function useReferenceKeyboard({
  open,
  busy,
  references,
  activeIndex,
  setActiveIndex,
  close,
  pickReference,
}: ReferenceKeyboardOptions) {
  return useCallback((event: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open) return false
    if (event.key === 'Escape' && !busy) {
      event.preventDefault()
      close()
      return true
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !busy) {
      event.preventDefault()
      if (references.length > 0) {
        const step = event.key === 'ArrowDown' ? 1 : -1
        setActiveIndex(index => (index + step + references.length) % references.length)
      }
      return true
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      event.preventDefault()
      const reference = references[Math.min(activeIndex, references.length - 1)]
      if (reference && !busy) void pickReference(reference)
      return true
    }
    return false
  }, [activeIndex, busy, close, open, pickReference, references, setActiveIndex])
}

/**
 * 统一管理项目与 PRD 引用的查询、键盘导航和光标插入。
 * 项目写入路径，PRD 先完成附件回调再写入可见标记。
 */
export function useProjectMention(
  value: string,
  setValue: DraftSetter,
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  options: ProjectMentionOptions,
) {
  const enabled = options.enabled ?? true
  const [trigger, setTrigger] = useState<MentionTrigger | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const open = enabled && trigger != null
  const catalog = useReferenceCatalog(open, trigger?.query ?? '')
  const editor = useMentionEditor({
    value,
    setValue,
    textareaRef,
    enabled,
    trigger,
    busy: busyKey !== null,
    setTrigger,
  })

  useEffect(() => {
    setActiveIndex(0)
    setActionError(null)
  }, [trigger?.query])

  useEffect(() => {
    if (!enabled || value === '') setTrigger(null)
  }, [enabled, value])

  /** 按引用类型执行路径插入或 PRD 附件加载。 */
  const pickReference = useCallback(async (reference: ReferenceOption) => {
    if (!trigger || busyKey) return
    setActionError(null)
    if (reference.kind === 'project') {
      editor.replaceTrigger(formatProjectMention(reference.path))
      return
    }
    setBusyKey(reference.key)
    try {
      await options.onPickPrd(reference.session)
      editor.replaceTrigger(`@PRD「${reference.name}」`)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyKey(null)
    }
  }, [busyKey, editor, options, trigger])
  const handleKeyDown = useReferenceKeyboard({
    open,
    busy: busyKey !== null,
    references: catalog.references,
    activeIndex,
    setActiveIndex,
    close: () => setTrigger(null),
    pickReference,
  })

  return {
    open,
    references: catalog.references,
    activeIndex: Math.min(activeIndex, Math.max(catalog.references.length - 1, 0)),
    loading: catalog.loading,
    warning: catalog.warning,
    actionError,
    busyKey,
    togglePicker: editor.togglePicker,
    pickReference,
    handleChange: editor.handleChange,
    handleKeyDown,
  }
}

/** 与 Codex composer 一致的统一引用入口。 */
export function ProjectMentionButton({
  active,
  disabled,
  className,
  onToggle,
}: {
  active: boolean
  disabled?: boolean
  className?: string
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label="引用项目或 PRD"
      title="引用项目或 PRD"
      onMouseDown={event => {
        event.preventDefault()
        onToggle()
      }}
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-lg border text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] disabled:opacity-50',
        active && 'bg-[var(--color-accent)]',
        className,
      )}
    >
      <AtSign className="size-4" />
    </button>
  )
}
