import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ChevronRight,
  Code2,
  Columns2,
  Eye,
  FileText,
  FolderTree,
  Loader2,
  RefreshCw,
  Save,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { ApiError } from '@/lib/api'
import { formatBytes, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { getLocalFile, getLocalTree, saveLocalFile } from '../api'
import { FileTree } from '../components/FileTree'
import { MarkdownEditor } from '../components/MarkdownEditor'
import { MarkdownPreview } from '../components/MarkdownPreview'
import type { RewriteContext } from '../lib/rewriteRelativeLinks'
import type { TreeNodeDTO } from '../types'

const INDEX_NAMES = ['INDEX.md', 'README.md', '00_index.md', 'index.md', 'readme.md']
type ViewMode = 'split' | 'source' | 'preview'

export function LocalEditorPage() {
  const params = useParams()
  const sourceId = params.sourceId ?? ''
  const splat = (params['*'] ?? '').trim()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false)
  const [draft, setDraft] = useState<string>('')
  // 保存时用来做乐观锁的 mtime；每次 load/save 同步刷新
  const baseMtimeRef = useRef<number>(0)
  // 加载完文件后用 originalContent 判 dirty；setDraft 不触发 useEffect 链
  const [originalContent, setOriginalContent] = useState<string>('')

  const treeQ = useQuery({
    queryKey: ['doc-viewer-local-tree', sourceId],
    queryFn: () => getLocalTree(sourceId),
    enabled: !!sourceId,
    staleTime: 30_000,
  })

  const currentFilePath = useMemo(() => {
    const nodes = treeQ.data?.nodes
    if (!nodes || nodes.length === 0) return null
    const byPath = new Map(nodes.map(n => [n.path, n] as [string, TreeNodeDTO]))
    if (splat) {
      const direct = byPath.get(splat)
      if (direct && direct.kind !== 'TREE') return splat
      return findIndexUnder(nodes, splat)
    }
    return findIndexUnder(nodes, '')
  }, [treeQ.data, splat])

  const fileQ = useQuery({
    queryKey: ['doc-viewer-local-file', sourceId, currentFilePath],
    queryFn: () => getLocalFile(sourceId, currentFilePath as string),
    enabled: !!sourceId && !!currentFilePath,
    staleTime: Infinity,
  })

  // 文件加载完成后把内容写入 draft
  useEffect(() => {
    const data = fileQ.data
    if (!data) return
    if (data.kind === 'BLOB') {
      setDraft(data.content ?? '')
      setOriginalContent(data.content ?? '')
      baseMtimeRef.current = data.lastModified
    } else {
      setDraft('')
      setOriginalContent('')
      baseMtimeRef.current = 0
    }
  }, [fileQ.data])

  useEffect(() => {
    setMobileTreeOpen(false)
  }, [currentFilePath])

  const saveM = useMutation({
    mutationFn: () =>
      saveLocalFile(sourceId, {
        path: currentFilePath as string,
        content: draft,
        expectedLastModified: baseMtimeRef.current,
      }),
    onSuccess: res => {
      baseMtimeRef.current = res.lastModified
      setOriginalContent(draft)
      qc.setQueryData(['doc-viewer-local-file', sourceId, currentFilePath], (prev: unknown) => {
        if (!prev || typeof prev !== 'object') return prev
        return { ...prev, content: draft, size: res.size, lastModified: res.lastModified }
      })
    },
  })

  const dirty = fileQ.data?.kind === 'BLOB' && draft !== originalContent

  const navigateToFile = useCallback(
    (path: string) => {
      // 离开当前文件前提示未保存
      if (dirty) {
        const ok = window.confirm('当前文件有未保存的修改，确定离开？')
        if (!ok) return
      }
      navigate(
        `/tools/doc-viewer/local/${encodeURIComponent(sourceId)}/${path
          .split('/')
          .map(encodeURIComponent)
          .join('/')}`,
      )
    },
    [dirty, navigate, sourceId],
  )

  const handleSave = useCallback(() => {
    if (!currentFilePath || !dirty || saveM.isPending) return
    saveM.mutate()
  }, [currentFilePath, dirty, saveM])

  // 关闭页面前提示未保存
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const rewriteCtx: RewriteContext | null = useMemo(() => {
    if (!fileQ.data || !currentFilePath) return null
    const slash = currentFilePath.lastIndexOf('/')
    const currentDir = slash < 0 ? '' : currentFilePath.substring(0, slash)
    return {
      rawBaseUrl: `/api/doc-viewer/local/sources/${encodeURIComponent(sourceId)}/raw?path=`,
      sourceId,
      currentDir,
      appRouteBase: '/tools/doc-viewer/local',
      rawJoinMode: 'query',
    }
  }, [fileQ.data, currentFilePath, sourceId])

  if (!sourceId) {
    return (
      <div className="p-6 text-sm">
        <Link to="/tools/doc-viewer" className="text-[var(--color-primary)] hover:underline">
          ← 返回文档源列表
        </Link>
      </div>
    )
  }

  const fileTree = treeQ.data ? (
    <FileTree
      nodes={treeQ.data.nodes}
      currentPath={currentFilePath ?? splat}
      onSelect={navigateToFile}
    />
  ) : treeQ.isLoading ? (
    <div className="p-3 text-xs">扫描目录…</div>
  ) : treeQ.error ? (
    <div className="p-3 text-xs text-[var(--color-destructive)]">
      {treeQ.error instanceof ApiError ? treeQ.error.message : String(treeQ.error)}
    </div>
  ) : null

  return (
    <div className="flex h-full flex-col">
      {/* === Header === */}
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-3 py-2 text-sm sm:px-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileTreeOpen(true)}
          title="打开目录"
        >
          <FolderTree className="h-4 w-4" />
        </Button>

        <div className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
          <Link
            to="/tools/doc-viewer"
            className="hidden items-center gap-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] sm:inline-flex"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            文档源
          </Link>
          <Link
            to="/tools/doc-viewer"
            className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] sm:hidden"
            title="返回文档源"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <ChevronRight className="hidden h-3 w-3 shrink-0 text-[var(--color-muted-foreground)] sm:inline" />
          <span
            className="hidden truncate font-medium sm:inline"
            title={treeQ.data?.rootPath}
          >
            {treeQ.data?.rootPath ?? '...'}
          </span>
          {currentFilePath && (
            <>
              <ChevronRight className="hidden h-3 w-3 shrink-0 text-[var(--color-muted-foreground)] sm:inline" />
              <span
                className="truncate text-xs text-[var(--color-muted-foreground)] sm:text-sm"
                title={currentFilePath}
                dir="rtl"
              >
                {currentFilePath}
              </span>
            </>
          )}
          {dirty && (
            <Badge variant="outline" className="ml-1 shrink-0 text-[10px]">
              未保存
            </Badge>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {fileQ.data && fileQ.data.kind === 'BLOB' && (
            <>
              <div className="hidden items-center gap-0.5 rounded-md border border-[var(--color-border)] p-0.5 sm:flex">
                <ViewModeButton
                  active={viewMode === 'source'}
                  onClick={() => setViewMode('source')}
                  title="仅源码"
                >
                  <Code2 className="h-3.5 w-3.5" />
                </ViewModeButton>
                <ViewModeButton
                  active={viewMode === 'split'}
                  onClick={() => setViewMode('split')}
                  title="分栏"
                >
                  <Columns2 className="h-3.5 w-3.5" />
                </ViewModeButton>
                <ViewModeButton
                  active={viewMode === 'preview'}
                  onClick={() => setViewMode('preview')}
                  title="仅预览"
                >
                  <Eye className="h-3.5 w-3.5" />
                </ViewModeButton>
              </div>
              <Badge variant="outline" className="hidden sm:inline-flex">
                {formatBytes(fileQ.data.size)}
              </Badge>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!dirty || saveM.isPending}
                className="gap-1"
                title="保存（Ctrl/Cmd+S）"
              >
                {saveM.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">保存</span>
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['doc-viewer-local-tree', sourceId] })
              qc.invalidateQueries({ queryKey: ['doc-viewer-local-file', sourceId, currentFilePath] })
            }}
            title="重新扫描目录"
            className="px-2 sm:px-3"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:ml-1 sm:inline">刷新</span>
          </Button>
        </div>
      </header>

      {saveM.error && (
        <div className="border-b border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-3 py-1.5 text-xs text-[var(--color-destructive)]">
          保存失败：
          {saveM.error instanceof ApiError ? saveM.error.message : String(saveM.error)}
        </div>
      )}

      {/* === 主体 === */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[240px_1fr]">
        <aside className="hidden overflow-y-auto border-r border-[var(--color-border)] p-2 md:block">
          {fileTree}
        </aside>

        <main className="flex min-w-0 flex-1 overflow-hidden">
          {!currentFilePath && treeQ.data && <EmptyState />}
          {fileQ.isLoading && (
            <div className="flex items-center gap-2 p-6 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              读取文件…
            </div>
          )}
          {fileQ.error && (
            <div className="p-6 text-sm text-[var(--color-destructive)]">
              {fileQ.error instanceof ApiError ? fileQ.error.message : String(fileQ.error)}
            </div>
          )}
          {fileQ.data && fileQ.data.kind === 'BINARY' && (
            <BinaryHint
              path={fileQ.data.path}
              size={fileQ.data.size}
              sourceId={sourceId}
              lastModified={fileQ.data.lastModified}
            />
          )}
          {fileQ.data && fileQ.data.kind === 'BLOB' && rewriteCtx && (
            <div className="flex h-full w-full min-w-0">
              {(viewMode === 'source' || viewMode === 'split') && (
                <div
                  className={cn(
                    'h-full overflow-hidden border-r border-[var(--color-border)]',
                    viewMode === 'split' ? 'w-1/2' : 'w-full',
                  )}
                >
                  <MarkdownEditor value={draft} onChange={setDraft} onSave={handleSave} />
                </div>
              )}
              {(viewMode === 'preview' || viewMode === 'split') && (
                <div
                  className={cn(
                    'h-full overflow-hidden',
                    viewMode === 'split' ? 'w-1/2' : 'w-full',
                  )}
                >
                  <MarkdownPreview content={draft} rewriteContext={rewriteCtx} />
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* 移动端：目录抽屉 */}
      <Sheet open={mobileTreeOpen} onOpenChange={setMobileTreeOpen}>
        <SheetContent side="left" className="w-72 max-w-[85vw] overflow-y-auto p-2">
          <SheetTitle className="px-2 py-2 text-sm font-semibold">目录</SheetTitle>
          {fileTree}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function ViewModeButton(props: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      title={props.title}
      className={cn(
        'rounded px-1.5 py-1 transition-colors',
        props.active
          ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
          : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]/40',
      )}
    >
      {props.children}
    </button>
  )
}

function findIndexUnder(nodes: TreeNodeDTO[], dirPath: string): string | null {
  for (const name of INDEX_NAMES) {
    const target = dirPath ? `${dirPath}/${name}` : name
    if (nodes.some(n => n.path === target && n.kind !== 'TREE')) return target
  }
  return null
}

function EmptyState() {
  return (
    <div className="m-auto rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted-foreground)] sm:p-10">
      <FileText className="mx-auto mb-3 h-8 w-8" />
      在左侧选择一个 markdown 文件开始编辑
      <div className="mt-2 text-xs md:hidden">点击左上角图标打开目录</div>
    </div>
  )
}

function BinaryHint(props: {
  path: string
  size: number
  sourceId: string
  lastModified: number
}) {
  const rawUrl = `/api/doc-viewer/local/sources/${encodeURIComponent(
    props.sourceId,
  )}/raw?path=${encodeURIComponent(props.path)}`
  return (
    <div className="m-auto flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-4 text-sm sm:p-6">
      <div className="break-all font-medium">{props.path}</div>
      <div className="text-xs text-[var(--color-muted-foreground)]">
        二进制（或非文本）文件，大小 {formatBytes(props.size)}，无法在此编辑
      </div>
      <div className="text-xs text-[var(--color-muted-foreground)]">
        最后修改：{formatDate(props.lastModified)}
      </div>
      <a
        className="text-[var(--color-primary)] hover:underline"
        href={rawUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        在浏览器打开原始字节
      </a>
    </div>
  )
}
