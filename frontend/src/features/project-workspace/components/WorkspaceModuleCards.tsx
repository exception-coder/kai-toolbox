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

const MODULE_TREE_INDENT_PX = 12
const MAX_MODULE_TREE_INDENT_DEPTH = 4

export function ModuleCard({
  module,
  sessionByCwd,
  pendingPath,
  onOpen,
  isPinned,
  onPin,
}: {
  module: ProjectModule
  sessionByCwd: Map<string, ClaudeChatSessionView>
  pendingPath: string | null
  onOpen: (module: ProjectModule) => void
  isPinned: (modulePath: string) => boolean
  onPin: (module: ProjectModule) => void
}) {
  const session = sessionByCwd.get(normalizePath(module.absPath))
  const children = module.children ?? []
  const pinned = isPinned(module.absPath)
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md border bg-[var(--color-background)] p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-[var(--color-foreground)]">{module.name}</span>
            <Badge variant={moduleTypeBadge(module.type)}>{module.type}</Badge>
          </div>
          {module.summary
            ? <div className="mt-1 line-clamp-2 text-xs text-[var(--color-muted-foreground)]">{module.summary}</div>
            : null}
          <div className="mt-1 truncate text-xs text-[var(--color-muted-foreground)]">{module.relPath}</div>
        </div>
        <Badge variant={session ? 'success' : 'outline'}>{session ? '已有会话' : '未打开'}</Badge>
      </div>
      <Separator />
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          size="sm"
          variant={pinned ? 'secondary' : 'ghost'}
          className="px-2 text-xs"
          onClick={() => onPin(module)}
          title={pinned ? '已加入待聚合，点击移除' : '钉入待聚合(跨项目联动)'}
        >
          <Pin className={cn('h-3.5 w-3.5', pinned && 'fill-current')} />
          {pinned ? '已钉' : '钉选'}
        </Button>
        <Button type="button" size="sm" onClick={() => onOpen(module)} disabled={pendingPath === module.absPath}>
          {pendingPath === module.absPath ? <Loader2 className="animate-spin" /> : session ? <BotMessageSquare /> : <Play />}
          {session ? '打开会话' : '新建会话'}
        </Button>
      </div>
      {children.length > 0 && (
        <div className="space-y-1.5 border-t pt-3">
          {children.map((child, ci) => (
            <ModuleChildRow
              key={`${child.relPath}|${child.name}|${ci}`}
              module={child}
              depth={1}
              sessionByCwd={sessionByCwd}
              pendingPath={pendingPath}
              onOpen={onOpen}
              isPinned={isPinned}
              onPin={onPin}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** 子模块递归树行：展示任意深度的 children，并允许每个节点独立开会话/钉选。 */
function ModuleChildRow({
  module,
  depth,
  sessionByCwd,
  pendingPath,
  onOpen,
  isPinned,
  onPin,
}: {
  module: ProjectModule
  depth: number
  sessionByCwd: Map<string, ClaudeChatSessionView>
  pendingPath: string | null
  onOpen: (module: ProjectModule) => void
  isPinned: (modulePath: string) => boolean
  onPin: (module: ProjectModule) => void
}) {
  const session = sessionByCwd.get(normalizePath(module.absPath))
  const opening = pendingPath === module.absPath
  const pinned = isPinned(module.absPath)
  const children = module.children ?? []
  const indentPx = Math.min(Math.max(depth - 1, 0), MAX_MODULE_TREE_INDENT_DEPTH) * MODULE_TREE_INDENT_PX

  return (
    <div className="space-y-1.5">
      <div
        className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-[var(--color-muted)]/40 px-2.5 py-1.5"
        style={{ marginLeft: indentPx }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <CornerDownRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
          <span className="truncate text-sm text-[var(--color-foreground)]">{module.name}</span>
          {session ? <Badge variant="success" className="text-[10px]">会话</Badge> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={pinned ? 'secondary' : 'ghost'}
            className="h-7 px-1.5 text-xs"
            onClick={() => onPin(module)}
            title={pinned ? '已加入待聚合，点击移除' : '钉入待聚合'}
          >
            <Pin className={cn('h-3.5 w-3.5', pinned && 'fill-current')} />
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onOpen(module)} disabled={opening}>
            {opening ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : session ? <BotMessageSquare className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {session ? '打开' : '新建'}
          </Button>
        </div>
      </div>
      {children.map((child, ci) => (
        <ModuleChildRow
          key={`${child.relPath}|${child.name}|${ci}`}
          module={child}
          depth={depth + 1}
          sessionByCwd={sessionByCwd}
          pendingPath={pendingPath}
          onOpen={onOpen}
          isPinned={isPinned}
          onPin={onPin}
        />
      ))}
    </div>
  )
}

export function StateLine({ text, icon, tone = 'muted' }: { text: string; icon?: ReactNode; tone?: 'muted' | 'danger' }) {
  return (
    <div
      className={cn(
        'flex min-h-28 items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-sm',
        tone === 'danger' ? 'text-[var(--color-destructive)]' : 'text-[var(--color-muted-foreground)]',
      )}
    >
      {icon}
      <span>{text}</span>
    </div>
  )
}

/** 待聚合篮子面板：按项目分组展示已钉模块，可移除/清空/一键聚合。 */
export function AggregationCart({
  items,
  aggregating,
  error,
  onRemove,
  onClear,
  onAggregate,
}: {
  items: AggregationItem[]
  aggregating: boolean
  error: string
  onRemove: (modulePath: string) => void
  onClear: () => void
  onAggregate: () => void
}) {
  const projectCount = new Set(items.map(i => i.projectPath)).size
  const grouped = new Map<string, AggregationItem[]>()
  for (const it of items) {
    const arr = grouped.get(it.projectName) ?? []
    arr.push(it)
    grouped.set(it.projectName, arr)
  }
  return (
    <Card className="border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5">
      <CardHeader className="gap-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Pin className="h-4 w-4 fill-current" />
          待聚合模块（{items.length}）
        </CardTitle>
        <CardDescription>
          跨项目钉选模块，一键软链各自项目根为合并工作区联动开发；聚合后自动带上联动提示。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {[...grouped.entries()].map(([proj, mods]) => (
            <div key={proj} className="min-w-0 rounded-md border bg-[var(--color-background)] px-2.5 py-1.5">
              <div className="mb-1 truncate text-xs font-medium text-[var(--color-foreground)]">{proj}</div>
              <div className="flex flex-wrap gap-1">
                {mods.map(m => (
                  <span key={m.modulePath} className="inline-flex items-center gap-1 rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-xs">
                    {m.moduleName}
                    <button type="button" onClick={() => onRemove(m.modulePath)} aria-label={`移除 ${m.moduleName}`}
                      className="text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        {error ? <p className="text-xs text-[var(--color-destructive)]">{error}</p> : null}
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={onAggregate} disabled={aggregating || items.length < 1}>
            {aggregating ? <Loader2 className="animate-spin" /> : <Boxes />}
            一键聚合（{projectCount} 个项目）
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClear} disabled={aggregating}>
            <Trash2 />清空
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** 「更新项目模块」diff 面板：展示新增候选（可勾选）+ 已消失告警，确认后只新增落 modules.json。 */

function moduleTypeBadge(type: string) {
  switch (type) {
    case 'maven':
    case 'gradle':
      return 'info'
    case 'node':
      return 'success'
    case 'python':
      return 'warning'
    case 'knowledge':
      return 'secondary'
    default:
      return 'outline'
  }
}
