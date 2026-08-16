import { lazy, Suspense, useRef, type ReactNode, type RefObject } from 'react'
import { FileText, Loader2, Wrench } from 'lucide-react'
import { MarkdownContent } from '@/components/markdown/MarkdownContent'
import { DocOutline } from '../DocOutline'

const MarkdownEditor = lazy(() =>
  import('@/features/doc-viewer/public-api').then((module) => ({ default: module.MarkdownEditor })),
)

export type EditingPanelMode = 'prd' | 'dev' | 'side'
export type EditingViewMode = 'split' | 'edit' | 'preview'

interface EditingPanelContentProps {
  panelMode: EditingPanelMode
  specificationLabel: string
  planLabel: string
  prdContent: string
  prdViewMode: EditingViewMode
  onPrdChange: (content: string) => void
  onPrdSave: () => void
  devDocContent: string
  devViewMode: EditingViewMode
  devDocStreaming: boolean
  devDocProgress: string
  devDocLoading: boolean
  onDevDocChange: (content: string) => void
  onDevDocSave: () => void
  onGenerateDevDoc: () => void
}

/** Renders the PRD, development document, or comparison workspace. */
export function EditingPanelContent({
  panelMode,
  specificationLabel,
  planLabel,
  prdContent,
  prdViewMode,
  onPrdChange,
  onPrdSave,
  devDocContent,
  devViewMode,
  devDocStreaming,
  devDocProgress,
  devDocLoading,
  onDevDocChange,
  onDevDocSave,
  onGenerateDevDoc,
}: EditingPanelContentProps) {
  const prdPreviewRef = useRef<HTMLDivElement>(null)
  const devPreviewRef = useRef<HTMLDivElement>(null)

  return (
    <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
      {panelMode === 'prd' && (
        <DocumentEditor
          content={prdContent}
          viewMode={prdViewMode}
          previewRef={prdPreviewRef}
          onChange={onPrdChange}
          onSave={onPrdSave}
        />
      )}

      {panelMode === 'dev' && (
        <DevelopmentDocumentEditor
          content={devDocContent}
          viewMode={devViewMode}
          previewRef={devPreviewRef}
          streaming={devDocStreaming}
          progress={devDocProgress}
          loading={devDocLoading}
          onChange={onDevDocChange}
          onSave={onDevDocSave}
          onGenerate={onGenerateDevDoc}
        />
      )}

      {panelMode === 'side' && (
        <ComparisonView
          specificationLabel={specificationLabel}
          planLabel={planLabel}
          prdContent={prdContent}
          devDocContent={devDocContent}
          devDocStreaming={devDocStreaming}
          devDocLoading={devDocLoading}
          onGenerateDevDoc={onGenerateDevDoc}
        />
      )}
    </div>
  )
}

function DocumentEditor({
  content,
  viewMode,
  previewRef,
  onChange,
  onSave,
}: {
  content: string
  viewMode: EditingViewMode
  previewRef: RefObject<HTMLDivElement | null>
  onChange: (content: string) => void
  onSave: () => void
}) {
  return (
    <div className="flex flex-1 overflow-hidden">
      {(viewMode === 'split' || viewMode === 'edit') && (
        <div className={`${viewMode === 'split' ? 'hidden md:block md:w-1/2 md:border-r md:border-[var(--color-border)]' : 'w-full'} h-full overflow-hidden`}>
          <Suspense fallback={<EditorLoading />}>
            <MarkdownEditor value={content} onChange={onChange} onSave={onSave} />
          </Suspense>
        </div>
      )}
      {(viewMode === 'split' || viewMode === 'preview') && (
        <div className={`${viewMode === 'split' ? 'w-full md:w-1/2' : 'w-full'} flex h-full overflow-hidden`}>
          <DocOutline content={content} targetRef={previewRef} />
          <div className="h-full flex-1 overflow-hidden">
            <MarkdownContent content={content} containerRef={previewRef} />
          </div>
        </div>
      )}
    </div>
  )
}

function DevelopmentDocumentEditor({
  content,
  viewMode,
  previewRef,
  streaming,
  progress,
  loading,
  onChange,
  onSave,
  onGenerate,
}: {
  content: string
  viewMode: EditingViewMode
  previewRef: RefObject<HTMLDivElement | null>
  streaming: boolean
  progress: string
  loading: boolean
  onChange: (content: string) => void
  onSave: () => void
  onGenerate: () => void
}) {
  if (streaming) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-purple-500/20 bg-purple-500/10 px-4 py-2 text-xs text-purple-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{progress || '正在生成开发文档…'}</span>
        </div>
        <div className="flex-1 overflow-hidden">
          <MarkdownContent content={content || '正在准备生成上下文，请稍候…'} />
        </div>
      </div>
    )
  }

  if (content) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        <DocumentEditor content={content} viewMode={viewMode} previewRef={previewRef} onChange={onChange} onSave={onSave} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 text-[var(--color-muted-foreground)]">
        <Loader2 className="h-6 w-6 animate-spin opacity-40" />
        <p className="text-sm opacity-70">正在加载开发文档…</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center gap-4 text-[var(--color-muted-foreground)]">
      <Wrench className="h-10 w-10 opacity-15" />
      <div className="text-center">
        <p className="mb-1 font-medium">还没有开发文档</p>
        <p className="text-sm opacity-70">Claude 会先查知识图谱，再生成精准的技术方案</p>
      </div>
      <button onClick={onGenerate} className="flex items-center gap-2 rounded-xl border border-purple-500/20 bg-purple-600/15 px-5 py-2.5 text-sm font-medium text-purple-400 hover:bg-purple-600/25">
        <Wrench className="h-4 w-4" /> 生成开发文档
      </button>
    </div>
  )
}

function ComparisonView({
  specificationLabel,
  planLabel,
  prdContent,
  devDocContent,
  devDocStreaming,
  devDocLoading,
  onGenerateDevDoc,
}: {
  specificationLabel: string
  planLabel: string
  prdContent: string
  devDocContent: string
  devDocStreaming: boolean
  devDocLoading: boolean
  onGenerateDevDoc: () => void
}) {
  return (
    <>
      <div className="flex h-1/2 w-full flex-col overflow-hidden border-b border-[var(--color-border)] md:h-full md:w-1/2 md:border-b-0 md:border-r">
        <DocumentPaneHeader icon={<FileText className="h-3 w-3" />} label={specificationLabel} />
        <div className="flex-1 overflow-hidden"><MarkdownContent content={prdContent} /></div>
      </div>
      <div className="flex h-1/2 w-full flex-col overflow-hidden md:h-full md:w-1/2">
        <DocumentPaneHeader
          icon={<Wrench className="h-3 w-3" />}
          label={planLabel}
          accent
          loading={devDocStreaming}
        />
        <div className="flex-1 overflow-hidden">
          {devDocContent ? <MarkdownContent content={devDocContent} /> : devDocStreaming ? (
            <MarkdownContent content="正在生成…" />
          ) : devDocLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />正在加载…
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--color-muted-foreground)]">
              <button onClick={onGenerateDevDoc} className="text-purple-400 hover:underline">生成开发文档</button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function DocumentPaneHeader({ icon, label, accent = false, loading = false }: {
  icon: ReactNode
  label: string
  accent?: boolean
  loading?: boolean
}) {
  return (
    <div className={`flex items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-muted)]/20 px-3 py-1.5 text-[10px] font-semibold ${accent ? 'text-purple-400' : 'text-[var(--color-muted-foreground)]'}`}>
      {icon}{label}
      {loading && <Loader2 className="ml-1 h-2.5 w-2.5 animate-spin" />}
    </div>
  )
}

function EditorLoading() {
  return <div className="p-4 text-sm text-[var(--color-muted-foreground)]">加载编辑器…</div>
}
