import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  ChevronRight,
  Code2,
  ExternalLink,
  FileText,
  FolderTree,
  List,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { ApiError } from '@/lib/api'
import { formatBytes } from '@/lib/utils'
import { getFile, getTree, refreshSource } from '../api'
import { FileTree } from '../components/FileTree'
import { MarkdownView } from '../components/MarkdownView'
import { RawTextView } from '../components/RawTextView'
import { TocPanel } from '../components/TocPanel'
import { chooseInitialViewMode } from '../lib/sizeStrategy'
import type { RewriteContext } from '../lib/rewriteRelativeLinks'
import type { TreeNodeDTO } from '../types'

const INDEX_NAMES = ['INDEX.md', 'README.md', '00_index.md', 'index.md', 'readme.md']

export function DocViewerPage() {
  const params = useParams()
  const sourceId = params.sourceId ?? ''
  const splat = (params['*'] ?? '').trim()
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [viewMode, setViewMode] = useState<'markdown' | 'raw' | null>(null)
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false)
  const [mobileTocOpen, setMobileTocOpen] = useState(false)

  const treeQ = useQuery({
    queryKey: ['doc-viewer-tree', sourceId],
    queryFn: () => getTree(sourceId),
    enabled: !!sourceId,
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
    queryKey: ['doc-viewer-file', sourceId, currentFilePath],
    queryFn: () => getFile(sourceId, currentFilePath as string),
    enabled: !!sourceId && !!currentFilePath,
    staleTime: Infinity,
  })

  useEffect(() => {
    if (fileQ.data) setViewMode(chooseInitialViewMode(fileQ.data.size))
  }, [fileQ.data?.sha])

  // 切换文件后自动收起移动端抽屉
  useEffect(() => {
    setMobileTreeOpen(false)
    setMobileTocOpen(false)
  }, [currentFilePath])

  const refreshM = useMutation({
    mutationFn: () => refreshSource(sourceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doc-viewer-tree', sourceId] })
      qc.invalidateQueries({ queryKey: ['doc-viewer-sources'] })
    },
  })

  const rootRef = useRef<HTMLDivElement | null>(null)

  const rewriteCtx: RewriteContext | null = useMemo(() => {
    if (!fileQ.data) return null
    const slash = fileQ.data.path.lastIndexOf('/')
    const currentDir = slash < 0 ? '' : fileQ.data.path.substring(0, slash)
    return {
      rawBaseUrl: fileQ.data.rawBaseUrl,
      sourceId,
      currentDir,
    }
  }, [fileQ.data, sourceId])

  if (!sourceId) {
    return (
      <div className="p-6 text-sm">
        <Link to="/tools/doc-viewer" className="text-[var(--color-primary)] hover:underline">
          ← 返回文档源列表
        </Link>
      </div>
    )
  }

  const navigateToFile = (path: string) => {
    navigate(
      `/tools/doc-viewer/${encodeURIComponent(sourceId)}/${path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`,
    )
  }

  const fileTree = treeQ.data ? (
    <FileTree
      nodes={treeQ.data.nodes}
      currentPath={currentFilePath ?? splat}
      onSelect={navigateToFile}
    />
  ) : treeQ.isLoading ? (
    <div className="p-3 text-xs">加载树…</div>
  ) : treeQ.error ? (
    <div className="p-3 text-xs text-[var(--color-destructive)]">
      {treeQ.error instanceof ApiError ? treeQ.error.message : String(treeQ.error)}
    </div>
  ) : null

  const tocPanel =
    fileQ.data && fileQ.data.kind === 'BLOB' && viewMode === 'markdown' ? (
      <TocPanel rootRef={rootRef} contentKey={fileQ.data.sha} />
    ) : (
      <div className="text-xs text-[var(--color-muted-foreground)]">无大纲</div>
    )

  return (
    <div className="flex h-full flex-col">
      {/* === Header === */}
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-3 py-2 text-sm sm:px-4">
        {/* 移动端：目录抽屉触发器 */}
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
          <span className="hidden truncate font-medium sm:inline">
            {treeQ.data ? `${treeQ.data.refSha.slice(0, 7)} @ ${treeQ.data.ref}` : '...'}
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
          {treeQ.data?.rateLimited && (
            <Badge variant="destructive" className="ml-1 shrink-0">
              限流
            </Badge>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {fileQ.data && (
            <>
              <Badge variant="outline" className="hidden sm:inline-flex">
                {formatBytes(fileQ.data.size)}
              </Badge>
              <Button
                variant={viewMode === 'markdown' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('markdown')}
                disabled={fileQ.data.kind === 'BINARY' || !fileQ.data.content}
                title="渲染视图"
                className="px-2 sm:px-3"
              >
                <FileText className="h-3.5 w-3.5" />
                <span className="hidden sm:ml-1 sm:inline">渲染</span>
              </Button>
              <Button
                variant={viewMode === 'raw' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('raw')}
                disabled={fileQ.data.kind === 'BINARY' || !fileQ.data.content}
                title="原始文本"
                className="px-2 sm:px-3"
              >
                <Code2 className="h-3.5 w-3.5" />
                <span className="hidden sm:ml-1 sm:inline">原文</span>
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refreshM.mutate()}
            disabled={refreshM.isPending}
            title="刷新树"
            className="px-2 sm:px-3"
          >
            <RefreshCw className={'h-3.5 w-3.5 ' + (refreshM.isPending ? 'animate-spin' : '')} />
            <span className="hidden sm:ml-1 sm:inline">刷新</span>
          </Button>
          {/* 移动/中屏：大纲抽屉触发器（仅当文件存在且为 markdown 时） */}
          {fileQ.data && fileQ.data.kind === 'BLOB' && viewMode === 'markdown' && (
            <Button
              variant="ghost"
              size="icon"
              className="xl:hidden"
              onClick={() => setMobileTocOpen(true)}
              title="打开大纲"
            >
              <List className="h-4 w-4" />
            </Button>
          )}
        </div>
      </header>

      {/* === 主体三栏（响应式） === */}
      <div className="grid flex-1 grid-cols-1 overflow-hidden md:grid-cols-[260px_1fr] xl:grid-cols-[260px_1fr_240px]">
        {/* 桌面：常驻左树（md 及以上） */}
        <aside className="hidden overflow-y-auto border-r border-[var(--color-border)] p-2 md:block">
          {fileTree}
        </aside>

        {/* 渲染主区 */}
        <main className="overflow-y-auto px-3 py-4 sm:px-6">
          {!currentFilePath && treeQ.data && <EmptyState />}
          {fileQ.isLoading && (
            <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              拉取文件…
            </div>
          )}
          {fileQ.error && (
            <div className="text-sm text-[var(--color-destructive)]">
              {fileQ.error instanceof ApiError ? fileQ.error.message : String(fileQ.error)}
            </div>
          )}
          {fileQ.data && fileQ.data.kind === 'BINARY' && (
            <BinaryHint
              path={fileQ.data.path}
              size={fileQ.data.size}
              rawBaseUrl={fileQ.data.rawBaseUrl}
            />
          )}
          {fileQ.data &&
            fileQ.data.kind === 'BLOB' &&
            fileQ.data.content !== null &&
            rewriteCtx &&
            (viewMode === 'raw' ? (
              <RawTextView content={fileQ.data.content} />
            ) : (
              <MarkdownView
                content={fileQ.data.content}
                size={fileQ.data.size}
                rewriteContext={rewriteCtx}
                contentKey={fileQ.data.sha}
                rootRef={rootRef}
              />
            ))}
        </main>

        {/* 桌面：常驻右 TOC（xl 及以上） */}
        <aside className="hidden overflow-y-auto border-l border-[var(--color-border)] p-3 xl:block">
          {tocPanel}
        </aside>
      </div>

      {/* === 移动端：左侧目录抽屉 === */}
      <Sheet open={mobileTreeOpen} onOpenChange={setMobileTreeOpen}>
        <SheetContent side="left" className="w-72 max-w-[85vw] overflow-y-auto p-2">
          <SheetTitle className="px-2 py-2 text-sm font-semibold">目录</SheetTitle>
          {fileTree}
        </SheetContent>
      </Sheet>

      {/* === 移动 / 中屏：右侧大纲抽屉 === */}
      <Sheet open={mobileTocOpen} onOpenChange={setMobileTocOpen}>
        <SheetContent side="right" className="w-64 max-w-[80vw] overflow-y-auto p-3">
          <SheetTitle className="mb-2 text-sm font-semibold">大纲</SheetTitle>
          {tocPanel}
        </SheetContent>
      </Sheet>
    </div>
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
    <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted-foreground)] sm:p-10">
      在左侧选择一个 markdown 文件
      <div className="mt-2 text-xs md:hidden">点击左上角图标打开目录</div>
    </div>
  )
}

function BinaryHint(props: { path: string; size: number; rawBaseUrl: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-4 text-sm sm:p-6">
      <div className="break-all font-medium">{props.path}</div>
      <div className="text-xs text-[var(--color-muted-foreground)]">
        二进制文件，大小 {formatBytes(props.size)}，本工具不渲染
      </div>
      <a
        className="inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline"
        href={props.rawBaseUrl + props.path}
        target="_blank"
        rel="noopener noreferrer"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        在浏览器打开 raw URL
      </a>
    </div>
  )
}
