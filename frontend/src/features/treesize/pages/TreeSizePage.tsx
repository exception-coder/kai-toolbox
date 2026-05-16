import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, History, Server, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { ApiError } from '@/lib/api'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { formatBytes, formatDate, formatDuration, formatNumber } from '@/lib/utils'
import { ScanForm } from '../components/ScanForm'
import { ScanProgress } from '../components/ScanProgress'
import { BreadcrumbNav } from '../components/BreadcrumbNav'
import { ChildrenList } from '../components/ChildrenList'
import { Treemap } from '../components/Treemap'
import { VideoPlayerModal } from '../components/VideoPlayerModal'
import { CleanupRecommendations } from '../components/CleanupRecommendations'
import { SymlinkDialog } from '../components/SymlinkDialog'
import { FailedDeletesPanel } from '../components/FailedDeletesPanel'
import { useScanEvents } from '../hooks/useScanEvents'
import { useVideoConfig } from '../hooks/useVideoConfig'
import {
  createSymlink,
  deleteFile,
  deleteScan,
  getChildren,
  listFailedDeletes,
  listScans,
  startScan,
} from '../api'
import type { NodeView, ScanView, StartScanPayload } from '../types'

export function TreeSizePage() {
  const qc = useQueryClient()
  const [activeScan, setActiveScan] = useState<ScanView | null>(null)
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [playingVideo, setPlayingVideo] = useState<{ scanId: string; node: NodeView } | null>(null)
  const [failedSheetOpen, setFailedSheetOpen] = useState(false)

  // Shared with FailedDeletesPanel via cache. We just read for the badge count and let
  // deleteMutation's onSuccess invalidate this key when a QUEUED outcome comes back.
  const failedListQuery = useQuery({
    queryKey: ['treesize-failed-deletes'],
    queryFn: listFailedDeletes,
    staleTime: 5_000,
  })
  const failedCount = failedListQuery.data?.length ?? 0

  const live = useScanEvents(activeScan?.status === 'RUNNING' ? activeScan.id : null)
  const videoConfig = useVideoConfig()

  const startMutation = useMutation({
    mutationFn: (payload: StartScanPayload) => startScan(payload),
    onMutate: () => setStartError(null),
    onSuccess: scan => {
      setActiveScan(scan)
      setCurrentPath(null)
      qc.invalidateQueries({ queryKey: ['treesize-history'] })
    },
    onError: (err: unknown) => {
      setStartError(err instanceof ApiError ? err.message : String(err))
    },
  })

  useEffect(() => {
    if (activeScan && live.status === 'completed') {
      qc.invalidateQueries({ queryKey: ['treesize-history'] })
      qc.invalidateQueries({ queryKey: ['treesize-children', activeScan.id] })
      setActiveScan(s => (s ? { ...s, status: 'COMPLETED', totalFiles: live.result?.totalFiles ?? s.totalFiles, totalDirs: live.result?.totalDirs ?? s.totalDirs, totalSize: live.result?.totalSize ?? s.totalSize, finishedAt: Date.now() } : s))
    }
  }, [live.status, live.result, activeScan, qc])

  const isRunning = live.status === 'running'

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">磁盘空间分析</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            扫描目录、按大小可视化、定位占用空间最多的文件夹
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFailedSheetOpen(true)}
          className="relative shrink-0 gap-1.5"
          aria-label="打开删除失败清单"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          失败清单
          {failedCount > 0 && (
            <Badge
              variant="destructive"
              className="ml-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none"
            >
              {failedCount > 99 ? '99+' : failedCount}
            </Badge>
          )}
        </Button>
      </header>

      <ScanForm
        onStart={payload => startMutation.mutate(payload)}
        disabled={isRunning || startMutation.isPending}
      />

      {startError && (
        <div className="rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs text-[var(--color-destructive)]">
          启动失败：{startError}
        </div>
      )}

      {activeScan && (
        <ScanProgress rootPath={activeScan.rootPath} state={live} />
      )}

      {activeScan && (live.status === 'completed' || activeScan.status === 'COMPLETED') && (
        <ScanResultView
          scan={activeScan}
          currentPath={currentPath}
          onNavigate={setCurrentPath}
          videoExtensions={videoConfig.videoExtensions}
          onPlayVideo={node => setPlayingVideo({ scanId: activeScan.id, node })}
        />
      )}



      {playingVideo && (
        <VideoPlayerModal
          scanId={playingVideo.scanId}
          path={playingVideo.node.path}
          name={playingVideo.node.name}
          open={true}
          onClose={() => setPlayingVideo(null)}
        />
      )}

      <Sheet open={failedSheetOpen} onOpenChange={setFailedSheetOpen}>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
          <SheetTitle className="sr-only">删除失败清单</SheetTitle>
          <SheetDescription className="sr-only">
            占用 / IO 失败的删除任务清单，可批量重试或清空
          </SheetDescription>
          <FailedDeletesPanel active={failedSheetOpen} />
        </SheetContent>
      </Sheet>

      <Separator className="my-2" />

      <ScanHistory
        onSelect={scan => {
          setActiveScan(scan)
          setCurrentPath(null)
        }}
        onDelete={async id => {
          await deleteScan(id)
          if (activeScan?.id === id) setActiveScan(null)
          qc.invalidateQueries({ queryKey: ['treesize-history'] })
        }}
      />
    </div>
  )
}

function ScanResultView({
  scan,
  currentPath,
  onNavigate,
  videoExtensions,
  onPlayVideo,
}: {
  scan: ScanView
  currentPath: string | null
  onNavigate: (path: string | null) => void
  videoExtensions: readonly string[]
  onPlayVideo: (node: NodeView) => void
}) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const queryPath = currentPath ?? scan.rootPath
  const isRemote = scan.sourceType === 'SSH'
  const [symlinkTarget, setSymlinkTarget] = useState<NodeView | null>(null)

  const { data: children = [], isLoading } = useQuery({
    queryKey: ['treesize-children', scan.id, queryPath],
    queryFn: () => getChildren(scan.id, queryPath),
  })

  const deleteMutation = useMutation({
    mutationFn: (node: NodeView) => deleteFile(scan.id, node.path),
    onSuccess: res => {
      qc.invalidateQueries({ queryKey: ['treesize-children', scan.id] })
      // A QUEUED outcome added the path to the registry; the badge / panel reads from this key.
      if (res.outcome === 'QUEUED') {
        qc.invalidateQueries({ queryKey: ['treesize-failed-deletes'] })
      }
    },
  })

  const symlinkMutation = useMutation({
    mutationFn: ({ node, target, taskId }: { node: NodeView; target: string; taskId: string }) =>
      createSymlink(scan.id, { sourcePath: node.path, targetPath: target, taskId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['treesize-children', scan.id] })
    },
  })

  const totalSize = children.reduce((acc, n) => acc + n.size, 0)

  const handleNavigate = (n: NodeView) => {
    if (n.dir) onNavigate(n.path)
  }

  const handleDelete = async (n: NodeView) => {
    const ok = await confirm({
      title: '确认删除文件',
      description: (
        <div className="space-y-1">
          <div className="break-all font-mono text-xs">{n.name}</div>
          <div className="text-xs tabular-nums">{formatBytes(n.size)}</div>
          <div className="pt-2">将移到回收站；如系统不支持回收站则永久删除。</div>
        </div>
      ),
      confirmText: '删除',
      cancelText: '取消',
      variant: 'destructive',
    })
    if (!ok) return
    try {
      const res = await deleteMutation.mutateAsync(n)
      if (res.outcome === 'QUEUED') {
        await confirm({
          title: '文件被占用',
          description: (
            <div className="space-y-2 text-sm">
              <div className="break-all font-mono text-xs">{n.name}</div>
              <div>
                文件正在被另一个程序使用，已加入页头的「失败清单」。请关闭占用程序后，去清单里批量重试。
              </div>
            </div>
          ),
          confirmText: '知道了',
          cancelText: '关闭',
        })
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e)
      await confirm({
        title: '删除失败',
        description: msg,
        confirmText: '知道了',
        cancelText: '关闭',
      })
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <BreadcrumbNav
        rootPath={scan.rootPath}
        currentPath={currentPath}
        onNavigate={onNavigate}
      />
      {isLoading ? (
        <div className="flex h-72 items-center justify-center rounded-md border text-sm text-[var(--color-muted-foreground)]">
          加载中…
        </div>
      ) : (
        <>
          <Treemap nodes={children} onNavigate={handleNavigate} />
          <ChildrenList
            nodes={children}
            totalSize={totalSize}
            videoExtensions={videoExtensions}
            onNavigate={handleNavigate}
            onPlayVideo={isRemote ? undefined : onPlayVideo}
            onDeleteFile={isRemote ? undefined : handleDelete}
            onSymlinkDir={isRemote ? undefined : setSymlinkTarget}
          />
          <CleanupRecommendations scanId={scan.id} />
        </>
      )}
      <SymlinkDialog
        open={!!symlinkTarget}
        node={symlinkTarget}
        onCancel={() => setSymlinkTarget(null)}
        onConfirm={async (target, taskId) => {
          if (!symlinkTarget) return
          await symlinkMutation.mutateAsync({ node: symlinkTarget, target, taskId })
          setSymlinkTarget(null)
        }}
      />
    </div>
  )
}

function ScanHistory({
  onSelect,
  onDelete,
}: {
  onSelect: (scan: ScanView) => void
  onDelete: (id: string) => void
}) {
  const { data: scans = [] } = useQuery({
    queryKey: ['treesize-history'],
    queryFn: () => listScans(),
  })

  if (scans.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="h-4 w-4" />
          扫描历史
        </CardTitle>
        <CardDescription>点击恢复查看；删除会同时清理节点数据</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ul>
          {scans.map(s => (
            <li
              key={s.id}
              className="border-t px-4 py-3 text-sm first:border-t-0 sm:px-6"
            >
              <button
                onClick={() => onSelect(s)}
                className="block w-full truncate text-left font-medium hover:underline"
                title={s.rootPath}
              >
                {s.sourceType === 'SSH' && <Server className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />}
                {s.rootPath}
              </button>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--color-muted-foreground)]">
                <StatusBadge status={s.status} />
                {s.sourceType === 'SSH' && (
                  <Badge variant="secondary">{s.sourceDisplayName ?? 'SSH'}</Badge>
                )}
                <span className="tabular-nums">
                  {formatNumber(s.totalFiles)} 文件 · {formatBytes(s.totalSize)}
                </span>
                <span>{formatDate(s.startedAt)}</span>
                {s.finishedAt && <span>· {formatDuration(s.finishedAt - s.startedAt)}</span>}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(s.id)}
                  title="删除此扫描"
                  className="ml-auto h-7 w-7"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function StatusBadge({ status }: { status: ScanView['status'] }) {
  const variantMap: Record<ScanView['status'], 'success' | 'secondary' | 'destructive'> = {
    COMPLETED: 'success',
    RUNNING: 'secondary',
    CANCELLED: 'secondary',
    FAILED: 'destructive',
  }
  const labelMap: Record<ScanView['status'], string> = {
    COMPLETED: '完成',
    RUNNING: '运行中',
    CANCELLED: '已取消',
    FAILED: '失败',
  }
  return <Badge variant={variantMap[status]}>{labelMap[status]}</Badge>
}
