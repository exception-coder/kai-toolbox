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
import { StateLine } from './WorkspaceModuleCards'

const TEAM_KNOWLEDGE_DIR = '~/.kai-toolbox/team-tools/project-domain-knowledge/knowledge'

export function ModuleSyncPanel({
  pending,
  error,
  data,
  selected,
  onToggle,
  onToggleAll,
  applying,
  applyError,
  onApply,
  onClose,
  onReload,
  onAnalyzeDatabase,
}: {
  pending: boolean
  error: string | null
  data?: ModuleSyncPreview
  selected: Set<string>
  onToggle: (codePath: string) => void
  onToggleAll: (codePaths: string[]) => void
  applying: boolean
  applyError: string | null
  onApply: (picks: { key: string; codePath: string }[]) => void
  onClose: () => void
  onReload: () => void
  onAnalyzeDatabase: () => void
}) {
  if (pending) {
    return <SyncPanelShell onClose={onClose}><StateLine icon={<Loader2 className="h-4 w-4 animate-spin" />} text="正在解析项目目录…" /></SyncPanelShell>
  }
  if (error) return <SyncPanelShell onClose={onClose}><StateLine tone="danger" text={error} /></SyncPanelShell>
  if (!data) return null
  if (!data.exists) return <SyncPanelShell onClose={onClose}><StateLine tone="danger" text="项目不存在或不在允许的工作区根内" /></SyncPanelShell>
  if (!data.knowledgeConfigured) {
    // 固定知识库目录不存在时，引导用户先完成团队依赖初始化。
    if (!data.knowledgeDirExists) {
      return (
        <SyncPanelShell onClose={onClose}>
          <div className="space-y-2.5 text-sm text-[var(--color-muted-foreground)]">
            <p>
              此功能依赖团队初始化后的 <b className="text-[var(--color-foreground)]">project-domain-knowledge</b>。
              当前约定目录 <code className="break-all">{data.knowledgeBaseDir || TEAM_KNOWLEDGE_DIR}</code> <b className="text-[var(--color-destructive)]">不存在</b>。
            </p>
            <KnowledgeDirSetup onSaved={onReload} />
          </div>
        </SyncPanelShell>
      )
    }
    // 知识库路径 OK，只是该项目还没生成清单 → 给 CLI 初始化命令
    return (
        <SyncPanelShell onClose={onClose}>
          <div className="space-y-2 text-sm text-[var(--color-muted-foreground)]">
            <p>知识库已配置，但该项目还没有 <code>modules.json</code>。首次初始化需指定代码基准目录，在知识库仓根执行：</p>
            <pre className="overflow-x-auto rounded bg-[var(--color-muted)]/50 p-2 text-xs text-[var(--color-foreground)]">cd {data.knowledgeBaseDir.replace(/[\\/]knowledge[\\/]?$/, '') || '<project-domain-knowledge 仓根>'}
node scripts/bootstrap.mjs sync-modules --project {data.project} --project-root {data.projectPath} --code-base &lt;相对路径,逗号分隔&gt; --apply</pre>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>也可先查询数据库菜单生成带真实菜单名的模块清单。</p>
              <Button type="button" variant="outline" size="sm" onClick={onAnalyzeDatabase}>
                <Sparkles />数据库分析菜单
              </Button>
            </div>
          </div>
        </SyncPanelShell>
    )
  }
  const selectable = data.added.filter(a => !a.keyConflict).map(a => a.codePath)
  const picks = data.added.filter(a => selected.has(a.codePath)).map(a => ({ key: a.key, codePath: a.codePath }))
  return (
    <SyncPanelShell onClose={onClose}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/20 p-3">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            数据库菜单分析以动态菜单表中的真实菜单名为准，再结合前后端代码补充模块路径。
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onAnalyzeDatabase}>
            <Sparkles />数据库分析菜单
          </Button>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-[var(--color-muted-foreground)]">现有 {data.currentCount} 条 · 新增候选 {data.added.length} · 已选 {picks.length}</span>
          {selectable.length > 0 && (
            <button type="button" className="text-xs text-[var(--color-primary)] hover:underline" onClick={() => onToggleAll(selectable)}>
              {selected.size >= selectable.length ? '全不选' : '全选可选'}
            </button>
          )}
        </div>
        {data.added.length === 0 ? (
          <StateLine text="没有新增模块，清单已与代码目录一致" />
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
            {data.added.map(a => (
              <label
                key={a.codePath}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm',
                  a.keyConflict ? 'opacity-60' : 'cursor-pointer hover:bg-[var(--color-accent)]',
                )}
              >
                <input
                  type="checkbox"
                  className="accent-[var(--color-primary)]"
                  checked={selected.has(a.codePath)}
                  disabled={a.keyConflict}
                  onChange={() => onToggle(a.codePath)}
                />
                <span className="shrink-0 font-medium text-[var(--color-foreground)]">{a.key}</span>
                {a.keyConflict && <Badge variant="warning" className="shrink-0 text-[10px]">key 冲突</Badge>}
                <span className="truncate text-xs text-[var(--color-muted-foreground)]">{a.codePath}</span>
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-[var(--color-muted-foreground)]">
          追加为骨架条目（name / webPath 留空），落盘后请补业务名与前端目录；技术目录（如 common/excel）别勾。
        </p>
        {data.missing.length > 0 && (
          <div className="space-y-0.5 rounded-md border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/5 p-2 text-xs text-[var(--color-muted-foreground)]">
            <div className="mb-1 flex items-center gap-1 text-[var(--color-destructive)]">
              <AlertTriangle className="h-3.5 w-3.5" />目录已消失（{data.missing.length}）— 只告警，不自动删除
            </div>
            {data.missing.map(m => <div key={m.codePath} className="truncate">· {m.key}「{m.name}」({m.codePath})</div>)}
          </div>
        )}
        {applyError && <p className="text-sm text-[var(--color-destructive)]">{applyError}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>取消</Button>
          <Button type="button" size="sm" disabled={picks.length === 0 || applying} onClick={() => onApply(picks)}>
            {applying ? <Loader2 className="animate-spin" /> : <Check />}
            应用所选（{picks.length}）
          </Button>
        </div>
      </div>
    </SyncPanelShell>
  )
}

/**
 * 工作台级提示：进项目就主动告知团队知识库初始化状态。
 * - 固定目录不存在 → 醒目横幅 + 初始化指引、重新检查；
 * - 路径 OK 但该项目未纳入清单(走了自动识别) → 轻量提示,引导点「更新模块」生成。
 */
export function WorkspaceKnowledgeNotice({
  data,
  onSaved,
  onOpenSync,
}: {
  data: ProjectModules
  onSaved: () => void
  onOpenSync: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  // 固定目录不存在时提示先执行团队依赖初始化。
  if (data.knowledgeDirExists === false) {
    return (
      <div className="mb-3 space-y-2 rounded-md border border-[var(--color-warning,#b45309)]/40 bg-[var(--color-warning,#b45309)]/5 p-3">
        <div className="flex items-start gap-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning,#b45309)]" />
          <div className="min-w-0">
            <div className="font-medium text-[var(--color-foreground)]">团队知识库未初始化，当前按目录自动识别</div>
            <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
              约定目录 <code className="break-all">{data.knowledgeBaseDir || TEAM_KNOWLEDGE_DIR}</code> 不存在，请先到 Vibe Coding 完成团队依赖初始化。
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={() => setExpanded(v => !v)}>
            {expanded ? '收起' : '查看目录'}
          </Button>
        </div>
        {expanded && <KnowledgeDirSetup onSaved={onSaved} />}
      </div>
    )
  }
  if (data.exists && data.fromKnowledge === false) {
    return (
      <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
        <span>该项目暂未纳入知识图谱清单，当前按目录自动识别（模块名=目录名）。</span>
        <Button type="button" size="sm" variant="ghost" className="h-7 shrink-0 px-2" onClick={onOpenSync}>
          <GitCompare className="h-3.5 w-3.5" />生成清单
        </Button>
      </div>
    )
  }
  return null
}

/**
 * 展示团队初始化后的固定知识库目录，并允许重新检查状态。
 */
export function KnowledgeDirSetup({ onSaved }: { onSaved: () => void }) {
  // 重新检查团队初始化生成的约定目录。
  const pullMut = useMutation({
    mutationFn: ensureKnowledgeBase,
    onSuccess: res => { if (res.status !== 'error' && res.status !== 'disabled') onSaved() },
  })
  const pullFailed = pullMut.data && (pullMut.data.status === 'error' || pullMut.data.status === 'disabled')

  return (
    <div className="space-y-3 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] p-2.5">
      {/* 团队依赖初始化状态 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium text-[var(--color-foreground)]">团队依赖初始化</div>
          <Button type="button" size="sm" className="shrink-0" disabled={pullMut.isPending} onClick={() => pullMut.mutate()}>
            {pullMut.isPending ? <Loader2 className="animate-spin" /> : <Download />}
            {pullMut.isPending ? '检查中…' : '重新检查'}
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
          请先在 Vibe Coding 的团队依赖面板完成初始化。知识库固定读取
          <code>~/.kai-toolbox/team-tools/project-domain-knowledge/knowledge</code>，这里不再重复拉取或配置路径。
        </p>
        {pullFailed && <p className="text-xs text-[var(--color-destructive)]">{pullMut.data?.message}</p>}
        {pullMut.isError && <p className="text-xs text-[var(--color-destructive)]">{errorMessage(pullMut.error)}</p>}
      </div>

      {pullMut.isSuccess && !pullFailed && <p className="text-xs text-[var(--color-primary)]">初始化目录已就绪。</p>}
    </div>
  )
}

function SyncPanelShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="mb-4 rounded-md border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5 p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-foreground)]">
          <GitCompare className="h-4 w-4" />更新项目模块（diff → 确认 → 只新增）
        </div>
        <button type="button" onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mb-2.5 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
        扫描项目代码目录、与知识库 <code>modules.json</code> 比对：勾选的新目录会<b className="text-[var(--color-foreground)]">追加为骨架条目</b>（只新增，
        不删除、不改动已有条目的中文名/路径）。改动直接写入 <code>modules.json</code>，
        <b className="text-[var(--color-foreground)]">不执行任何脚本、不改动项目代码</b>；等价于 CLI 的 <code>bootstrap.mjs sync-modules</code>，但由后端直接读写。
      </p>
      {children}
    </div>
  )
}

/** 右上角项目类型标签：标识当前选中项目是什么工程（Maven / Java Web (传统) / Node …）。 */
export function ProjectTypeBadge({ loading, data }: { loading: boolean; data?: ProjectModules }) {
  if (loading) {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        识别中
      </Badge>
    )
  }
  if (!data || !data.exists) return null
  return (
    <Badge variant={projectTypeBadge(data.projectType)} className="gap-1">
      <Boxes className="h-3.5 w-3.5" />
      {data.projectTypeLabel || '未知'}
    </Badge>
  )
}

function projectTypeBadge(type?: string) {
  switch (type) {
    case 'maven':
    case 'gradle':
      return 'info'
    case 'node':
      return 'success'
    case 'python':
      return 'warning'
    case 'java-web':
    case 'knowledge':
      return 'secondary'
    default:
      return 'outline'
  }
}
