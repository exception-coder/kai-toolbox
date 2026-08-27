import { useEffect, useMemo, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import { EditorView } from '@codemirror/view'
import { ChevronLeft, ChevronRight, Clipboard, Code2, ListFilter, Search, TextCursorInput, WrapText } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  parsePendingSqlReview,
  type PendingSqlStatement,
  type PendingSqlStatementKind,
} from '../lib/pendingSqlReview'

interface Props {
  sqlText: string
  onSqlTextChange: (value: string) => void
  onError: (message: string) => void
  expanded: boolean
  /** 页签工作区只负责审阅；登记弹框显式允许编辑完整原文。 */
  allowEditing?: boolean
}

const KIND_LABELS: Record<PendingSqlStatementKind, string> = {
  DDL: 'DDL',
  DML: 'DML',
  ROLLBACK: '回滚',
  OTHER: '其他',
}

const KIND_TONES: Record<PendingSqlStatementKind, string> = {
  DDL: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  DML: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  ROLLBACK: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  OTHER: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}

const editorTheme = EditorView.theme({
  '&': { fontSize: '13px', height: '100%', minHeight: 0, overflow: 'hidden' },
  '.cm-scroller': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    height: '100%',
    minHeight: 0,
    overflowX: 'auto',
    overflowY: 'scroll !important',
    scrollbarGutter: 'stable',
    scrollbarWidth: 'auto',
    scrollbarColor: 'rgba(148, 163, 184, 0.72) rgba(15, 23, 42, 0.55)',
  },
  '.cm-content': { padding: '12px 0' },
  '.cm-gutters': { borderRight: '1px solid color-mix(in srgb, currentColor 12%, transparent)' },
})

/** 多语句 SQL 的只读清单与单条详情；编辑模式始终编辑完整原文。 */
export function PendingSqlReviewWorkspace({
  sqlText,
  onSqlTextChange,
  onError,
  expanded,
  allowEditing = true,
}: Props) {
  const statements = useMemo(() => parsePendingSqlReview(sqlText), [sqlText])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<PendingSqlStatementKind | 'ALL'>('ALL')
  const [wrapLines, setWrapLines] = useState(false)
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!statements.length) {
      setActiveId(null)
      return
    }
    if (!activeId || !statements.some(statement => statement.id === activeId)) {
      setActiveId(statements[0].id)
    }
  }, [activeId, statements])

  const activeIndex = Math.max(0, statements.findIndex(statement => statement.id === activeId))
  const active = statements[activeIndex] ?? emptyStatement(sqlText)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const filtered = statements.filter(statement => (
    (kind === 'ALL' || statement.kind === kind)
    && (!normalizedQuery || statement.searchText.includes(normalizedQuery))
  ))
  const showList = !editing && statements.length > 1

  const copyCurrent = async () => {
    const value = active.sql
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1_500)
    } catch {
      onError('复制失败，请在 SQL 查看器中手动选择复制')
    }
  }

  const selectRelative = (offset: number) => {
    if (!statements.length) return
    const next = Math.min(statements.length - 1, Math.max(0, activeIndex + offset))
    setActiveId(statements[next].id)
  }

  return (
    <section className={cn(
      'flex min-h-0 overflow-hidden rounded-xl border bg-[var(--color-background)]',
      expanded ? 'flex-1' : 'h-[440px]',
    )}>
      {showList && (
        <aside className="hidden w-72 shrink-0 flex-col border-r bg-[var(--color-muted)]/25 md:flex">
          <div className="shrink-0 space-y-2 border-b p-3">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>SQL 清单</span>
              <span className="font-normal text-[var(--color-muted-foreground)]">共 {statements.length} 条</span>
            </div>
            <label className="flex h-8 items-center gap-2 rounded-md border bg-[var(--color-background)] px-2">
              <Search className="size-3.5 text-[var(--color-muted-foreground)]" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="搜索用途、对象或 SQL"
                className="min-w-0 flex-1 bg-transparent text-xs outline-none"
              />
            </label>
            <label className="flex h-8 items-center gap-2 rounded-md border bg-[var(--color-background)] px-2">
              <ListFilter className="size-3.5 text-[var(--color-muted-foreground)]" />
              <select
                value={kind}
                onChange={event => setKind(event.target.value as PendingSqlStatementKind | 'ALL')}
                className="min-w-0 flex-1 bg-transparent text-xs outline-none"
              >
                <option value="ALL">全部类型</option>
                <option value="DDL">DDL</option>
                <option value="DML">DML</option>
                <option value="ROLLBACK">回滚</option>
                <option value="OTHER">其他</option>
              </select>
            </label>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto p-2"
            tabIndex={0}
            onKeyDown={event => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault()
                selectRelative(event.key === 'ArrowUp' ? -1 : 1)
              }
            }}
          >
            {filtered.length ? filtered.map(statement => (
              <StatementRow
                key={statement.id}
                statement={statement}
                active={statement.id === active.id}
                onSelect={() => setActiveId(statement.id)}
              />
            )) : (
              <p className="px-2 py-8 text-center text-xs text-[var(--color-muted-foreground)]">没有匹配的 SQL</p>
            )}
          </div>
        </aside>
      )}

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex min-h-12 shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', KIND_TONES[active.kind])}>
                {KIND_LABELS[active.kind]}
              </span>
              <span className="truncate text-xs font-semibold" title={active.title}>{active.title}</span>
            </div>
            <p className="mt-0.5 text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
              {editing ? `编辑完整原文 · ${sqlText.split(/\r?\n/).length} 行` : `SQL ${activeIndex + 1} / ${statements.length || 1} · 共 ${active.lineCount} 行`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setWrapLines(value => !value)}
            className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px]', wrapLines && 'bg-[var(--color-accent)]')}
            title="切换自动换行"
          >
            <WrapText className="size-3.5" />换行
          </button>
          {allowEditing && (
            <button
              type="button"
              onClick={() => setEditing(value => !value)}
              className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px]', editing && 'bg-[var(--color-accent)]')}
            >
              {editing ? <Code2 className="size-3.5" /> : <TextCursorInput className="size-3.5" />}
              {editing ? '返回审阅' : '编辑原文'}
            </button>
          )}
          {!editing && statements.length > 1 && (
            <select
              value={active.id}
              onChange={event => setActiveId(event.target.value)}
              className="h-8 w-full rounded-md border bg-[var(--color-background)] px-2 text-xs outline-none md:hidden"
              aria-label="选择 SQL"
            >
              {statements.map(statement => (
                <option key={statement.id} value={statement.id}>{statement.order}. {statement.title}</option>
              ))}
            </select>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden bg-slate-950">
          <CodeMirror
            className="h-full min-h-0 overflow-hidden"
            value={editing ? sqlText : active.displaySql}
            onChange={editing ? onSqlTextChange : undefined}
            extensions={[editorTheme, sql(), ...(wrapLines ? [EditorView.lineWrapping] : [])]}
            theme="dark"
            readOnly={!editing}
            editable={editing}
            height="100%"
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: editing,
              highlightActiveLineGutter: editing,
              autocompletion: false,
              indentOnInput: editing,
              bracketMatching: true,
              searchKeymap: true,
            }}
          />
        </div>

        <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-2 border-t px-3 py-2">
          {!editing && statements.length > 1 && (
            <>
              <button type="button" onClick={() => selectRelative(-1)} disabled={activeIndex <= 0} className="rounded-md border p-1.5 disabled:opacity-40" title="上一条 SQL">
                <ChevronLeft className="size-3.5" />
              </button>
              <button type="button" onClick={() => selectRelative(1)} disabled={activeIndex >= statements.length - 1} className="rounded-md border p-1.5 disabled:opacity-40" title="下一条 SQL">
                <ChevronRight className="size-3.5" />
              </button>
            </>
          )}
          <span className="text-[11px] text-[var(--color-muted-foreground)]">按 Ctrl+F 搜索当前内容</span>
          {!editing && (
            <button type="button" onClick={copyCurrent} className="ml-auto inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px]">
              <Clipboard className="size-3.5" />{copied ? '已复制当前' : '复制当前'}
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

function StatementRow({ statement, active, onSelect }: {
  statement: PendingSqlStatement
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'mb-1 w-full rounded-lg border px-2.5 py-2 text-left transition-colors',
        active
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/8'
          : 'border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-accent)]',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-[var(--color-muted-foreground)]">{statement.order}</span>
        <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-semibold', KIND_TONES[statement.kind])}>
          {KIND_LABELS[statement.kind]}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={statement.title}>{statement.title}</span>
      </div>
      {statement.objectName && (
        <p className="mt-1 truncate pl-7 font-mono text-[10px] text-[var(--color-muted-foreground)]" title={statement.objectName}>
          {statement.objectName}
        </p>
      )}
    </button>
  )
}

function emptyStatement(sqlText: string): PendingSqlStatement {
  return {
    id: 'empty', order: 1, sql: sqlText, displaySql: sqlText, kind: 'OTHER', operation: 'SQL 语句', objectName: null,
    title: 'SQL 语句', lineCount: Math.max(1, sqlText.split(/\r?\n/).length), searchText: sqlText.toLocaleLowerCase(),
  }
}
