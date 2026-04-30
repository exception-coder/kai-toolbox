import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { History, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ApiError } from '@/lib/api'
import { formatBytes, formatDate, formatDuration, formatNumber } from '@/lib/utils'
import { ScanForm } from '../components/ScanForm'
import { ScanProgress } from '../components/ScanProgress'
import { BreadcrumbNav } from '../components/BreadcrumbNav'
import { ChildrenList } from '../components/ChildrenList'
import { Treemap } from '../components/Treemap'
import { useScanEvents } from '../hooks/useScanEvents'
import { deleteScan, getChildren, listScans, startScan } from '../api'
import type { NodeView, ScanView } from '../types'

export function TreeSizePage() {
  const qc = useQueryClient()
  const [activeScan, setActiveScan] = useState<ScanView | null>(null)
  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [startError, setStartError] = useState<string | null>(null)

  const live = useScanEvents(activeScan?.status === 'RUNNING' ? activeScan.id : null)

  const startMutation = useMutation({
    mutationFn: startScan,
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
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">磁盘空间分析</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            扫描目录、按大小可视化、定位占用空间最多的文件夹
          </p>
        </div>
      </header>

      <ScanForm
        onStart={path => startMutation.mutate(path)}
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
        />
      )}

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
}: {
  scan: ScanView
  currentPath: string | null
  onNavigate: (path: string | null) => void
}) {
  const queryPath = currentPath ?? scan.rootPath

  const { data: children = [], isLoading } = useQuery({
    queryKey: ['treesize-children', scan.id, queryPath],
    queryFn: () => getChildren(scan.id, queryPath),
  })

  const totalSize = children.reduce((acc, n) => acc + n.size, 0)

  const handleNavigate = (n: NodeView) => {
    if (n.dir) onNavigate(n.path)
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
          <ChildrenList nodes={children} totalSize={totalSize} onNavigate={handleNavigate} />
        </>
      )}
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
              className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-t px-6 py-2.5 text-sm first:border-t-0"
            >
              <button
                onClick={() => onSelect(s)}
                className="truncate text-left hover:underline"
                title={s.rootPath}
              >
                {s.rootPath}
              </button>
              <StatusBadge status={s.status} />
              <div className="text-xs tabular-nums text-[var(--color-muted-foreground)]">
                {formatNumber(s.totalFiles)} 文件 · {formatBytes(s.totalSize)}
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
                <span>{formatDate(s.startedAt)}</span>
                {s.finishedAt && <span>· {formatDuration(s.finishedAt - s.startedAt)}</span>}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(s.id)}
                  title="删除此扫描"
                  className="h-7 w-7"
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
