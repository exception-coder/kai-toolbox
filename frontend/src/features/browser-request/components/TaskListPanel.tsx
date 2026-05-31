import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, PlayCircle, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { ReplayFormDialog } from './ReplayFormDialog'
import { ReplayProgressPanel } from './ReplayProgressPanel'
import { replays, tasks as taskApi } from '../api'
import type { TaskView } from '../types'

const TASKS_KEY = (sid: string) => ['browser-request', 'tasks', sid] as const

interface Props {
  sessionId: string
  onEdit: (taskId: string) => void
}

/**
 * 任务列表 + 回放入口。
 *   - 点编辑 → 跳到编排页（外层切 canvas）
 *   - 点回放 → 弹 ReplayFormDialog → 提交 → 切换为 ReplayProgressPanel
 */
export function TaskListPanel({ sessionId, onEdit }: Props) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { data: list = [], isPending } = useQuery({
    queryKey: TASKS_KEY(sessionId),
    queryFn: () => taskApi.list(sessionId),
  })

  const [replayingTask, setReplayingTask] = useState<TaskView | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [replayError, setReplayError] = useState<string | null>(null)

  const replayMut = useMutation({
    mutationFn: ({ taskId, params }: { taskId: string; params: Record<string, unknown> }) =>
      replays.trigger(taskId, { params }),
    onSuccess: run => {
      setRunId(run.id)
      setReplayingTask(null)
      setReplayError(null)
    },
    onError: e => setReplayError((e as Error).message),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => taskApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY(sessionId) }),
  })

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-2">
          <div className="mb-2 text-sm font-medium">任务（{list.length}）</div>
          {isPending && <div className="text-xs text-[var(--color-muted-foreground)]">加载中…</div>}
          {list.length === 0 && !isPending && (
            <div className="rounded-md border border-dashed p-4 text-center text-xs text-[var(--color-muted-foreground)]">
              还没有任务。先去「录制」录一段，然后点「用这些调用编排」。
            </div>
          )}
          <ul className="space-y-1">
            {list.map(t => {
              // 三个独立维度：
              //   标记 = 所有 step 上「把 URL/body 某段替换成 ${var}」的总条数（用户最直观感知到的「标了变量」）
              //   抽取 = 所有 step 上「从响应里挑字段」的总条数
              //   入参 = task.params，回放时需要用户填的（标记里引用的、上游没抽出来的变量才会进这里）
              const paramMarks = t.steps.reduce((s, st) => s + (st.parameterizations?.length ?? 0), 0)
              const extractCount = t.steps.reduce((s, st) => s + (st.extracts?.length ?? 0), 0)
              return (
              <li key={t.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{t.name}</div>
                  <div className="flex flex-wrap gap-1 text-[10px] text-[var(--color-muted-foreground)]">
                    <Badge variant="secondary">{t.steps.length} step</Badge>
                    {paramMarks > 0 && (
                      <Badge variant="secondary" title="step 中标记的 ${变量} 总数">
                        {paramMarks} 标记
                      </Badge>
                    )}
                    {extractCount > 0 && (
                      <Badge variant="secondary" title="从响应里抽取的字段总数">
                        {extractCount} 抽取
                      </Badge>
                    )}
                    <Badge variant="secondary" title="回放时需要用户填的变量（被标记但上游没抽出来的）">
                      {t.params.length} 入参
                    </Badge>
                    {t.recordingId == null && <Badge variant="outline">adhoc</Badge>}
                    <span>· 更新于 {new Date(t.updatedAt).toLocaleString()}</span>
                  </div>
                </div>
                <Button size="sm" onClick={() => { setReplayingTask(t); setReplayError(null) }}>
                  <PlayCircle className="size-4" />
                  回放
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onEdit(t.id)} title="编辑">
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="sm" variant="ghost"
                  onClick={async () => {
                    const ok = await confirm({
                      title: '删除任务',
                      description: `「${t.name}」会被删除，回放历史也会清除。`,
                      variant: 'destructive', confirmText: '删除',
                    })
                    if (ok) deleteMut.mutate(t.id)
                  }}
                  title="删除"
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            )})}
          </ul>
        </CardContent>
      </Card>

      {replayingTask && (
        <ReplayFormDialog
          taskName={replayingTask.name}
          params={replayingTask.params}
          pending={replayMut.isPending}
          error={replayError}
          onConfirm={params => replayMut.mutate({ taskId: replayingTask.id, params })}
          onCancel={() => { setReplayingTask(null); setReplayError(null) }}
        />
      )}

      {runId && <ReplayProgressPanel runId={runId} onClose={() => setRunId(null)} />}
    </div>
  )
}
