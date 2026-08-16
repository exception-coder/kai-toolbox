import {
  BotMessageSquare,
  ClipboardCheck,
  Clock,
  Copy,
  FileText,
  FolderOpen,
  GitBranch,
  Info,
  Loader2,
  Plus,
  RefreshCw,
  Rocket,
  Wrench,
} from 'lucide-react'
import type { ReactNode } from 'react'
import type { DevDocEstimation } from '../../types'
import { EstimationBadge } from '../EstimationBadge'
import type { EditingPanelMode, EditingViewMode } from './EditingPanelContent'

interface ToolbarDocumentState {
  panelMode: EditingPanelMode
  prdViewMode: EditingViewMode
  devViewMode: EditingViewMode
  specificationLabel: string
  planLabel: string
  hasDevDoc: boolean
  isDevDocStale: boolean
  devDocContent: string
  devDocStreaming: boolean
  devDocLoading: boolean
  devDocDirty: boolean
  devDocSaving: boolean
  prdDirty: boolean
  prdSaving: boolean
  mdPath?: string | null
  devDocPath?: string | null
  copiedPath: 'prd' | 'dev' | null
}

interface ToolbarProgressState {
  estimation: DevDocEstimation | null
  progressPath: string | null
  progressGeneratedAt: number | null
}

interface ToolbarActions {
  selectPanel: (mode: EditingPanelMode) => void
  selectPrdView: (mode: EditingViewMode) => void
  selectDevView: (mode: EditingViewMode) => void
  generateDevDoc: (mode: 'generate' | 'regenerate' | 'update') => void
  showDevDocHistory: () => void
  showDevDocClarification: () => void
  showEstimation: () => void
  showEstimationDetail: () => void
  evaluateProgress: () => void
  showProgressHistory: () => void
  returnToClarify: () => void
  startDevelopment: () => void
  reset: () => void
  copyPath: (path: string | null | undefined, which: 'prd' | 'dev') => void
  copyPrd: () => void
  copyDevDoc: () => void
  savePrd: () => void
  saveDevDoc: () => void
}

export function EditingPanelToolbar({
  document,
  progress,
  returningToClarify,
  actions,
}: {
  document: ToolbarDocumentState
  progress: ToolbarProgressState
  returningToClarify: boolean
  actions: ToolbarActions
}) {
  const choosePanel = (mode: EditingPanelMode) => {
    actions.selectPanel(mode)
    if ((mode === 'dev' || mode === 'side') && !document.hasDevDoc && !document.devDocContent
        && !document.devDocStreaming && !document.devDocLoading) {
      actions.generateDevDoc('generate')
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 md:flex-nowrap md:px-4">
      <div className="flex items-center gap-0.5 rounded-lg bg-[var(--color-muted)]/40 p-0.5 text-xs">
        {([
          { key: 'prd', label: document.specificationLabel, icon: <FileText className="h-3 w-3" /> },
          { key: 'dev', label: document.isDevDocStale && document.devDocContent ? `⚠ ${document.planLabel}` : document.planLabel, icon: <Wrench className="h-3 w-3" /> },
          { key: 'side', label: '并排', icon: null },
        ] as const).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => choosePanel(key)}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 transition-colors ${
              document.panelMode === key
                ? key === 'dev'
                  ? document.isDevDocStale && document.devDocContent
                    ? 'bg-amber-500/20 font-medium text-amber-400'
                    : 'bg-purple-600/20 font-medium text-purple-400'
                  : 'bg-[var(--color-card)] font-medium text-[var(--color-foreground)] shadow-sm'
                : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
            }`}
          >
            {icon}{label}
            {key === 'dev' && document.devDocStreaming && <Loader2 className="ml-0.5 h-2.5 w-2.5 animate-spin" />}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1 text-xs">
        {document.panelMode === 'prd' && (['split', 'edit', 'preview'] as const).map(mode => (
          <button key={mode} onClick={() => actions.selectPrdView(mode)} className={`rounded px-2 py-0.5 ${document.prdViewMode === mode ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]'}`}>
            {viewLabel(mode)}
          </button>
        ))}
        {document.panelMode === 'dev' && !document.devDocStreaming && (['split', 'edit', 'preview'] as const).map(mode => (
          <button key={mode} onClick={() => actions.selectDevView(mode)} className={`rounded px-2 py-0.5 ${document.devViewMode === mode ? 'bg-purple-600/20 font-medium text-purple-400' : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]'}`}>
            {viewLabel(mode)}
          </button>
        ))}
        {document.panelMode === 'dev' && document.devDocContent && !document.devDocStreaming && (
          <>
            <ToolbarButton icon={<RefreshCw className="h-3 w-3" />} label="重新生成" onClick={() => actions.generateDevDoc('regenerate')} />
            <ToolbarButton icon={<GitBranch className="h-3 w-3" />} label="更新版本" onClick={() => actions.generateDevDoc('update')} />
            <ToolbarButton icon={<Info className="h-3 w-3" />} label="生成记录" onClick={actions.showDevDocHistory} />
            <ToolbarButton icon={<BotMessageSquare className="h-3 w-3" />} label="本版澄清" onClick={actions.showDevDocClarification} />
            {progress.estimation ? (
              <>
                <EstimationBadge estimation={progress.estimation} onClick={actions.showEstimationDetail} />
                <ToolbarButton icon={<RefreshCw className="h-3 w-3" />} onClick={actions.showEstimation} />
              </>
            ) : <ToolbarButton icon={<Clock className="h-3 w-3" />} label="评估工时" onClick={actions.showEstimation} />}
            <ToolbarButton icon={<ClipboardCheck className="h-3 w-3" />} label={progress.progressPath ? '重新评估进度' : '评估进度'} onClick={actions.evaluateProgress} />
            {progress.progressPath && <ToolbarButton icon={<Info className="h-3 w-3" />} label="评估记录" title={progressTitle(progress.progressGeneratedAt)} onClick={actions.showProgressHistory} />}
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <button disabled={returningToClarify} onClick={actions.returnToClarify} className="flex items-center gap-1.5 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/8 px-3 py-1.5 text-xs font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/15 disabled:opacity-50">
          {returningToClarify ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BotMessageSquare className="h-3.5 w-3.5" />} 返回需求澄清
        </button>
        <button onClick={actions.startDevelopment} className="flex items-center gap-1.5 rounded-lg border border-green-500/30 bg-green-600/20 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-600/30">
          <Rocket className="h-3.5 w-3.5" /> 开始开发
        </button>
        <div className="h-4 w-px bg-[var(--color-border)]" />
        <button onClick={actions.reset} className="flex items-center gap-1 rounded border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"><Plus className="h-3 w-3" /> 新建</button>
        <DocumentSaveActions document={document} actions={actions} />
      </div>
    </div>
  )
}

function DocumentSaveActions({ document, actions }: { document: ToolbarDocumentState; actions: ToolbarActions }) {
  const isDev = document.panelMode === 'dev'
  const dirty = isDev ? document.devDocDirty : document.prdDirty
  const path = isDev ? document.devDocPath : document.mdPath
  const which = isDev ? 'dev' : 'prd'
  const saving = isDev ? document.devDocSaving : document.prdSaving
  return <>
    {dirty && <span className="text-xs text-yellow-500">未保存</span>}
    {path && <button onClick={() => actions.copyPath(path, which)} title={path} className="flex items-center gap-1 rounded border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]">
      {document.copiedPath === which ? <ClipboardCheck className="h-3 w-3 text-green-500" /> : <FolderOpen className="h-3 w-3" />} 复制路径
    </button>}
    <button onClick={isDev ? actions.copyDevDoc : actions.copyPrd} title="复制内容" className="flex items-center gap-1 rounded border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]"><Copy className="h-3 w-3" /></button>
    <button disabled={!dirty || saving} onClick={isDev ? actions.saveDevDoc : actions.savePrd} className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs disabled:opacity-40 ${isDev ? 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30' : 'bg-[var(--color-primary)] text-white hover:opacity-90'}`}>
      {saving && <Loader2 className="h-3 w-3 animate-spin" />} 保存
    </button>
  </>
}

function ToolbarButton({ icon, label, title, onClick }: { icon: ReactNode; label?: string; title?: string; onClick: () => void }) {
  return <button onClick={onClick} title={title} className="flex items-center gap-1 rounded px-2 py-0.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-purple-500/10 hover:text-purple-400">{icon}{label}</button>
}

function viewLabel(mode: EditingViewMode): string {
  return mode === 'split' ? '分栏' : mode === 'edit' ? '编辑' : '预览'
}

function progressTitle(generatedAt: number | null): string {
  if (!generatedAt) return '查看历次进度评估报告'
  const time = new Date(generatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return `查看历次进度评估报告（最近一次 ${time}）`
}
