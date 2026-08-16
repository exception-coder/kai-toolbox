import { useState, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, BotMessageSquare, Boxes, Check, CornerDownRight, Download, Eye, EyeOff, FileDiff, GitCompare, Loader2, Pencil, Pin, Play, RefreshCw, Sparkles, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { StatusBadge } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'
import { getSystemWorkspaceDisplayName } from '@/lib/systemCatalog'
import {
  ensureKnowledgeBase,
  type ClaudeChatSessionView,
  type ModuleSyncPreview,
  type ProjectModule,
  type ProjectModules,
  type WorkspaceDir,
} from '@/features/claude-chat/public-api'
import {
  GRAPHIFY_LABEL,
  GRAPHIFY_TONE,
  REGISTRATION_LABEL,
  REGISTRATION_TONE,
  type ProjectStatusSnapshot,
} from '@/features/knowledge-graph/public-api'
import { type AggregationItem } from '../hooks/useAggregationCart'
import { useStatusCache, type BusinessFilter, type GraphifyFilter } from '../hooks/useStatusCache'
import { useIgnoredProjects, type IgnoreFilter } from '../hooks/useIgnoredProjects'
import { errorMessage, normalizePath } from '../lib/workspaceModel'

export function fmtCheckedAt(iso?: string | null): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', { hour12: false })
}

export function ProjectButton({
  project,
  selected,
  snapshot,
  ignored,
  editing,
  aliasDraft,
  aliasSaving,
  aliasError,
  onToggleIgnore,
  onShowChanges,
  onEditAlias,
  onAliasDraftChange,
  onCancelAlias,
  onSaveAlias,
  onClick,
}: {
  project: WorkspaceDir & { root: string }
  selected: boolean
  snapshot?: ProjectStatusSnapshot
  ignored: boolean
  editing: boolean
  aliasDraft: string
  aliasSaving: boolean
  aliasError: string
  onToggleIgnore: () => void
  onShowChanges: () => void
  onEditAlias: () => void
  onAliasDraftChange: (value: string) => void
  onCancelAlias: () => void
  onSaveAlias: () => void
  onClick: () => void
}) {
  return (
    <div
      className={cn(
        'relative w-full min-w-0 rounded-md border transition-colors',
        selected
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
          : 'border-[var(--color-border)] hover:bg-[var(--color-accent)]',
      )}
    >
      <button type="button" onClick={onClick} className="flex w-full min-w-0 flex-col gap-1 px-3 py-2 pr-24 text-left">
        <span className="truncate text-sm font-medium text-[var(--color-foreground)]">{getSystemWorkspaceDisplayName(project)}</span>
        {project.alias && <span className="truncate text-[10px] text-[var(--color-muted-foreground)]">{project.name}</span>}
        <span className="truncate text-xs text-[var(--color-muted-foreground)]">{project.root}</span>
        <div className="mt-0.5 flex flex-wrap items-center gap-1">
        {ignored ? (
          <StatusBadge tone="neutral" className="px-1.5 py-0 text-[10px]">已忽略</StatusBadge>
        ) : (
          <>
            <StatusBadge
              tone={snapshot?.graphifyState ? GRAPHIFY_TONE[snapshot.graphifyState] : 'neutral'}
              className="px-1.5 py-0 text-[10px]"
            >
              {snapshot?.graphifyState ? GRAPHIFY_LABEL[snapshot.graphifyState] : '未检测'}
            </StatusBadge>
            <StatusBadge
              tone={snapshot?.businessGraphState ? REGISTRATION_TONE[snapshot.businessGraphState] : 'neutral'}
              className="px-1.5 py-0 text-[10px]"
            >
              {snapshot?.businessGraphState ? REGISTRATION_LABEL[snapshot.businessGraphState] : '未检测'}
            </StatusBadge>
            {snapshot?.checkedAt && (
              <span
                className="text-[10px] text-[var(--color-muted-foreground)]"
                title={`上次检测：${new Date(snapshot.checkedAt).toLocaleString()}`}
              >
                检测于 {fmtCheckedAt(snapshot.checkedAt)}
              </span>
            )}
          </>
        )}
        </div>
      </button>
      <div className="absolute right-2 top-2 flex gap-0.5">
        <button
          type="button"
          className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          title="查看 Git 当前更改"
          aria-label={`查看 ${getSystemWorkspaceDisplayName(project)} 的 Git 当前更改`}
          onClick={onShowChanges}
        >
          <FileDiff className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          title="编辑项目别名"
          onClick={onEditAlias}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          title={ignored ? '取消忽略：恢复参与「检测全部」' : '忽略：不参与「检测全部」批量知识图谱检测'}
          onClick={onToggleIgnore}
        >
          {ignored ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
      </div>
      {editing && (
        <div className="border-t border-[var(--color-border)] p-2">
          <form className="flex gap-1" onSubmit={event => { event.preventDefault(); onSaveAlias() }}>
            <Input
              autoFocus
              className="h-8 text-xs"
              maxLength={100}
              value={aliasDraft}
              onChange={event => onAliasDraftChange(event.target.value)}
              placeholder="项目别名（留空则清除）"
            />
            <Button type="submit" size="icon" className="h-8 w-8" disabled={aliasSaving} title="保存别名">
              {aliasSaving ? <Loader2 className="animate-spin" /> : <Check />}
            </Button>
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={onCancelAlias} title="取消">
              <X />
            </Button>
          </form>
          {aliasError && <p className="mt-1 text-[10px] text-[var(--color-destructive)]">{aliasError}</p>}
        </div>
      )}
    </div>
  )
}

/**
 * 左侧项目列表上方的知识图谱区：Graphify / 业务图谱两个知识源各一行 chips，纵向堆叠、可换行，
 * 不做「数据源 × 状态」二维矩阵（避免读成后台筛选表格）。选中态用实心高亮，其余弱化。
 */
export function KnowledgeGraphFilterBar({
  kg,
  ignored,
  onRefreshAll,
}: {
  kg: ReturnType<typeof useStatusCache>
  ignored: ReturnType<typeof useIgnoredProjects>
  onRefreshAll: () => void
}) {
  const graphifyOptions: { value: GraphifyFilter; label: string }[] = [
    { value: 'ALL', label: '全部' },
    { value: 'UNCHECKED', label: '未检测' },
    { value: 'NOT_GENERATED', label: '未生成' },
    { value: 'STALE', label: '已过时' },
    { value: 'UP_TO_DATE', label: '最新' },
  ]
  const businessOptions: { value: BusinessFilter; label: string }[] = [
    { value: 'ALL', label: '全部' },
    { value: 'UNCHECKED', label: '未检测' },
    { value: 'NOT_REGISTERED', label: '未登记' },
    { value: 'PARTIAL', label: '部分' },
    { value: 'REGISTERED', label: '已登记' },
  ]
  const ignoreOptions: { value: IgnoreFilter; label: string }[] = [
    { value: 'ALL', label: '全部' },
    { value: 'NOT_IGNORED', label: '未忽略' },
    { value: 'IGNORED', label: '已忽略' },
  ]
  return (
    <div className="mt-2 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--color-foreground)]">知识图谱</span>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-1 text-[11px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] disabled:opacity-50"
          disabled={kg.refreshing}
          onClick={onRefreshAll}
          title="并发检测当前项目列表的 Graphify + 业务图谱状态，写入本地缓存"
        >
          {kg.refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          检测全部
        </button>
      </div>
      <FilterChipRow label="Graphify" value={kg.graphifyFilter} onChange={kg.setGraphifyFilter} options={graphifyOptions} />
      <FilterChipRow label="业务图谱" value={kg.businessFilter} onChange={kg.setBusinessFilter} options={businessOptions} />
      {kg.refreshError && <p className="text-[11px] text-[var(--color-destructive)]">{kg.refreshError}</p>}
      <div className="border-t border-[var(--color-border)] pt-2">
        <FilterChipRow label="忽略状态" value={ignored.filter} onChange={ignored.setFilter} options={ignoreOptions} />
      </div>
    </div>
  )
}

/** 单个知识源一行：名称独占一行 + 下方可换行的 chips，选中态高亮，替代 Segmented 单行硬挤五个选项。 */
function FilterChipRow<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (next: T) => void
  options: ReadonlyArray<{ value: T; label: string }>
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] text-[var(--color-muted-foreground)]">{label}</div>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = opt.value === value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                active
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 font-medium text-[var(--color-primary)]'
                  : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]',
              )}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

