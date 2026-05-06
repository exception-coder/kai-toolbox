import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { History, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ApiError } from '@/lib/api'
import { formatBytes, formatDate, formatNumber } from '@/lib/utils'
import { ScanForm } from '../components/ScanForm'
import { ScanProgress } from '../components/ScanProgress'
import { Stepper, type StepKey, type StepState } from '../components/Stepper'
import { DuplicateGroupList } from '../components/DuplicateGroupList'
import { MovePreview } from '../components/MovePreview'
import { MoveProgress } from '../components/MoveProgress'
import { useScanEvents } from '../hooks/useScanEvents'
import { useMoveEvents } from '../hooks/useMoveEvents'
import {
  deleteDuplicates,
  deleteScan,
  getDuplicates,
  getMovePlan,
  listScans,
  skipDedupe,
  startMove,
  startScan,
} from '../api'
import type { FlattenScan } from '../types'

export function FlattenPage() {
  const qc = useQueryClient()
  const [active, setActive] = useState<FlattenScan | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  const [moveActive, setMoveActive] = useState(false)

  const scanLive = useScanEvents(active?.status === 'SCANNING' ? active.id : null)
  const moveLive = useMoveEvents(active?.status === 'MOVING' ? active.id : null, moveActive)

  // 扫描完成后把统计同步到 active
  useEffect(() => {
    if (active && scanLive.status === 'completed' && scanLive.result) {
      setActive(s =>
        s
          ? {
              ...s,
              status: 'SCANNED',
              totalFiles: scanLive.result!.totalFiles,
              totalSize: scanLive.result!.totalSize,
              duplicateGroups: scanLive.result!.duplicateGroups,
              duplicateFiles: scanLive.result!.duplicateFiles,
              duplicateSize: scanLive.result!.duplicateSize,
              filesToMove:
                scanLive.result!.totalFiles -
                (scanLive.result!.duplicateFiles - scanLive.result!.duplicateGroups),
            }
          : s,
      )
      qc.invalidateQueries({ queryKey: ['flatten-history'] })
    }
  }, [scanLive.status, scanLive.result, active, qc])

  // 迁移完成同步状态
  useEffect(() => {
    if (active && moveLive.status === 'completed' && moveLive.result) {
      setActive(s =>
        s
          ? {
              ...s,
              status: 'COMPLETED',
              movedFiles: moveLive.result!.movedFiles,
              finishedAt: Date.now(),
            }
          : s,
      )
      setMoveActive(false)
      qc.invalidateQueries({ queryKey: ['flatten-history'] })
    }
  }, [moveLive.status, moveLive.result, active, qc])

  const startMutation = useMutation({
    mutationFn: ({ source, target }: { source: string; target: string }) => startScan(source, target),
    onMutate: () => setStartError(null),
    onSuccess: scan => {
      setActive(scan)
      setMoveActive(false)
      qc.invalidateQueries({ queryKey: ['flatten-history'] })
    },
    onError: e => {
      setStartError(e instanceof ApiError ? e.message : String(e))
    },
  })

  const dedupeMutation = useMutation({
    mutationFn: ({ id, keepPaths }: { id: string; keepPaths: string[] }) =>
      deleteDuplicates(id, keepPaths),
    onSuccess: (_res, vars) => {
      setActive(s => (s && s.id === vars.id ? { ...s, status: 'READY', duplicateGroups: 0, duplicateFiles: 0, duplicateSize: 0 } : s))
      qc.invalidateQueries({ queryKey: ['flatten-duplicates', vars.id] })
      qc.invalidateQueries({ queryKey: ['flatten-move-plan', vars.id] })
    },
  })

  const skipMutation = useMutation({
    mutationFn: (id: string) => skipDedupe(id),
    onSuccess: scan => setActive(scan),
  })

  const moveMutation = useMutation({
    mutationFn: (id: string) => startMove(id),
    onSuccess: scan => {
      setActive(scan)
      setMoveActive(true)
    },
  })

  const stepState = computeStepState(active)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">目录扁平化</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            把嵌套目录中的文件平铺到一处，迁移前先检测重复并选择性删除
          </p>
        </div>
        {active && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setActive(null)
              setMoveActive(false)
              setStartError(null)
            }}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            重新开始
          </Button>
        )}
      </header>

      <Stepper
        steps={[
          { key: 'scan', label: '扫描与哈希', state: stepState.scan },
          { key: 'dedupe', label: '处理重复', state: stepState.dedupe },
          { key: 'move', label: '迁移', state: stepState.move },
        ]}
      />

      <ScanForm
        onStart={(source, target) => startMutation.mutate({ source, target })}
        disabled={!!active && active.status !== 'COMPLETED' && active.status !== 'FAILED' && active.status !== 'CANCELLED'}
      />

      {startError && (
        <div className="rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs text-[var(--color-destructive)]">
          启动失败：{startError}
        </div>
      )}

      {active && active.status === 'FAILED' && active.errorMsg && (
        <div className="rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10 px-3 py-2 text-xs text-[var(--color-destructive)]">
          失败原因：{active.errorMsg}
        </div>
      )}

      {active && (
        <ScanProgress sourcePath={active.sourcePath} state={scanLive} />
      )}

      {active && (active.status === 'SCANNED' || active.status === 'DEDUPING') && (
        <DedupeStage
          scan={active}
          busy={dedupeMutation.isPending || skipMutation.isPending}
          onConfirm={paths => dedupeMutation.mutate({ id: active.id, keepPaths: paths })}
          onSkip={() => skipMutation.mutate(active.id)}
        />
      )}

      {active && (active.status === 'READY' || active.status === 'MOVING' || active.status === 'COMPLETED') && (
        <MoveStage
          scan={active}
          moveLive={moveLive}
          starting={moveMutation.isPending}
          onStart={() => moveMutation.mutate(active.id)}
        />
      )}

      <Separator className="my-2" />

      <FlattenHistory
        onSelect={scan => {
          setActive(scan)
          setMoveActive(false)
        }}
        onDelete={async id => {
          await deleteScan(id)
          if (active?.id === id) setActive(null)
          qc.invalidateQueries({ queryKey: ['flatten-history'] })
        }}
      />
    </div>
  )
}

function computeStepState(scan: FlattenScan | null): Record<StepKey, StepState> {
  if (!scan) return { scan: 'active', dedupe: 'pending', move: 'pending' }
  switch (scan.status) {
    case 'SCANNING':
      return { scan: 'active', dedupe: 'pending', move: 'pending' }
    case 'SCANNED':
    case 'DEDUPING':
      return { scan: 'done', dedupe: 'active', move: 'pending' }
    case 'READY':
      return { scan: 'done', dedupe: 'done', move: 'active' }
    case 'MOVING':
      return { scan: 'done', dedupe: 'done', move: 'active' }
    case 'COMPLETED':
      return { scan: 'done', dedupe: 'done', move: 'done' }
    case 'FAILED':
    case 'CANCELLED':
      return { scan: 'pending', dedupe: 'pending', move: 'pending' }
  }
}

function DedupeStage({
  scan,
  busy,
  onConfirm,
  onSkip,
}: {
  scan: FlattenScan
  busy: boolean
  onConfirm: (paths: string[]) => void
  onSkip: () => void
}) {
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['flatten-duplicates', scan.id],
    queryFn: () => getDuplicates(scan.id),
    enabled: scan.status === 'SCANNED',
  })

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-[var(--color-muted-foreground)]">
          加载重复清单中…
        </CardContent>
      </Card>
    )
  }

  return (
    <DuplicateGroupList
      groups={groups}
      onConfirmDelete={onConfirm}
      onSkip={onSkip}
      busy={busy}
    />
  )
}

function MoveStage({
  scan,
  moveLive,
  starting,
  onStart,
}: {
  scan: FlattenScan
  moveLive: ReturnType<typeof useMoveEvents>
  starting: boolean
  onStart: () => void
}) {
  const { data: plan = [], isLoading } = useQuery({
    queryKey: ['flatten-move-plan', scan.id],
    queryFn: () => getMovePlan(scan.id),
    enabled: scan.status === 'READY',
  })

  if (scan.status === 'READY') {
    if (isLoading) {
      return (
        <Card>
          <CardContent className="p-4 text-sm text-[var(--color-muted-foreground)]">
            生成迁移计划中…
          </CardContent>
        </Card>
      )
    }
    return (
      <MovePreview
        targetPath={scan.targetPath}
        plan={plan}
        onStart={onStart}
        busy={starting}
      />
    )
  }

  // MOVING / COMPLETED
  return <MoveProgress targetPath={scan.targetPath} state={moveLive} />
}

function FlattenHistory({
  onSelect,
  onDelete,
}: {
  onSelect: (scan: FlattenScan) => void
  onDelete: (id: string) => void
}) {
  const { data: scans = [] } = useQuery({
    queryKey: ['flatten-history'],
    queryFn: () => listScans(),
  })

  if (scans.length === 0) return null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <History className="h-4 w-4" />
          扁平化历史
        </CardTitle>
        <CardDescription>点击恢复查看；删除会同时清理记录</CardDescription>
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
                className="block w-full truncate text-left hover:underline"
                title={`${s.sourcePath} → ${s.targetPath}`}
              >
                <span className="font-mono text-xs">{s.sourcePath}</span>
                <span className="mx-1 text-[var(--color-muted-foreground)]">→</span>
                <span className="font-mono text-xs">{s.targetPath}</span>
              </button>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--color-muted-foreground)]">
                <StatusBadge status={s.status} />
                <span className="tabular-nums">
                  {formatNumber(s.totalFiles)} 文件 · {formatBytes(s.totalSize)}
                </span>
                <span>{formatDate(s.startedAt)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(s.id)}
                  title="删除此记录"
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

function StatusBadge({ status }: { status: FlattenScan['status'] }) {
  const variant: Record<FlattenScan['status'], 'success' | 'secondary' | 'destructive' | 'default'> = {
    COMPLETED: 'success',
    READY: 'default',
    SCANNED: 'default',
    SCANNING: 'secondary',
    DEDUPING: 'secondary',
    MOVING: 'secondary',
    CANCELLED: 'secondary',
    FAILED: 'destructive',
  }
  const label: Record<FlattenScan['status'], string> = {
    SCANNING: '扫描中',
    SCANNED: '待处理重复',
    DEDUPING: '删重复中',
    READY: '待迁移',
    MOVING: '迁移中',
    COMPLETED: '完成',
    CANCELLED: '已取消',
    FAILED: '失败',
  }
  return <Badge variant={variant[status]}>{label[status]}</Badge>
}
