import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  FileText,
  Pause,
  Play,
  Power,
  RefreshCw,
  RotateCcw,
  Square,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ApiError } from '@/lib/api'
import { composeAction, containerAction, listContainers } from '../api'
import type { ComposeAction, ContainerAction, ContainerView } from '../types'

interface Props {
  hostId: string
  appId: string | null
  appBaseDir: string | null
  onPickLog: (cid: string) => void
}

const STALE_TIME = 30_000

const STATE_BADGE: Record<string, string> = {
  running: 'bg-green-500/15 text-green-600 border-green-500/30',
  exited: 'bg-gray-500/15 text-gray-600 border-gray-500/30',
  paused: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  restarting: 'bg-blue-500/15 text-blue-600 border-blue-500/30',
  created: 'bg-gray-400/15 text-gray-500 border-gray-400/30',
}

export function ContainerTable({ hostId, appId, appBaseDir, onPickLog }: Props) {
  const qc = useQueryClient()
  const [includeStopped, setIncludeStopped] = useState(true)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [composeOutput, setComposeOutput] = useState<{ action: ComposeAction; exitCode: number; stdout: string; stderr: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const containersQuery = useQuery({
    queryKey: ['docker', 'containers', hostId, appId, includeStopped],
    queryFn: () => listContainers(hostId, appId ?? undefined, includeStopped, false),
    staleTime: STALE_TIME,
  })
  const containers = containersQuery.data ?? []

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['docker', 'containers', hostId] })
    qc.invalidateQueries({ queryKey: ['docker', 'stats', hostId] })
  }

  function forceRefresh() {
    listContainers(hostId, appId ?? undefined, includeStopped, true)
      .then(() => qc.invalidateQueries({ queryKey: ['docker', 'containers', hostId] }))
      .catch(e => setError(toMsg(e)))
  }

  const containerActionMutation = useMutation({
    mutationFn: ({ cid, action }: { cid: string; action: ContainerAction }) =>
      containerAction(hostId, cid, action),
    onMutate: ({ cid, action }) => setPendingAction(`${action}:${cid}`),
    onSettled: () => {
      setPendingAction(null)
      invalidate()
    },
    onError: e => setError(toMsg(e)),
  })

  const composeMutation = useMutation({
    mutationFn: (action: ComposeAction) => composeAction(hostId, appId!, action),
    onMutate: action => setPendingAction(`compose:${action}`),
    onSuccess: (resp, action) => {
      setComposeOutput({ action, exitCode: resp.exitCode, stdout: resp.stdout, stderr: resp.stderr })
      setError(null)
    },
    onSettled: () => {
      setPendingAction(null)
      invalidate()
    },
    onError: e => setError(toMsg(e)),
  })

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 flex-wrap">
        <CardTitle className="text-sm">
          容器 <span className="text-xs text-muted-foreground ml-1">({containers.length})</span>
        </CardTitle>
        <div className="flex items-center gap-1.5 flex-wrap">
          <label className="text-xs flex items-center gap-1">
            <input type="checkbox" checked={includeStopped}
                   onChange={e => setIncludeStopped(e.target.checked)} />
            含已停止
          </label>
          <Button size="sm" variant="ghost" onClick={forceRefresh} title="强制刷新（绕过缓存）">
            <RefreshCw className="size-3.5" /> 刷新
          </Button>
          {appId && appBaseDir && (
            <>
              <span className="mx-1 h-4 w-px bg-border" />
              <Button size="sm" variant="default" disabled={pendingAction === 'compose:up'}
                      onClick={() => composeMutation.mutate('up')}>
                <Power className="size-3.5" /> Up -d
              </Button>
              <Button size="sm" variant="outline" disabled={pendingAction === 'compose:restart'}
                      onClick={() => composeMutation.mutate('restart')}>
                <RotateCcw className="size-3.5" /> Restart
              </Button>
              <Button size="sm" variant="outline" disabled={pendingAction === 'compose:pull'}
                      onClick={() => composeMutation.mutate('pull')}>
                <ChevronDown className="size-3.5" /> Pull
              </Button>
              <Button size="sm" variant="destructive" disabled={pendingAction === 'compose:down'}
                      onClick={() => {
                        if (confirm('确认 compose down？这会停止并移除当前应用容器')) composeMutation.mutate('down')
                      }}>
                <Square className="size-3.5" /> Down
              </Button>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error && (
          <div className="mb-2 text-xs text-red-500 border border-red-300 rounded px-2 py-1">{error}</div>
        )}
        {composeOutput && (
          <div className="mb-2 border rounded p-2 bg-[var(--color-muted)]/30 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">
                compose {composeOutput.action} → exitCode {composeOutput.exitCode}
              </span>
              <button className="text-muted-foreground hover:underline"
                      onClick={() => setComposeOutput(null)}>关闭</button>
            </div>
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap">{composeOutput.stdout || composeOutput.stderr || '(无输出)'}</pre>
          </div>
        )}
        {containersQuery.isLoading ? (
          <div className="text-center text-xs text-muted-foreground py-6">加载中…</div>
        ) : containers.length === 0 ? (
          <div className="text-center text-xs text-muted-foreground py-6">无容器</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="text-muted-foreground">
                <tr className="border-b">
                  <th className="text-left py-1.5 pl-2 font-normal">名称</th>
                  <th className="text-left py-1.5 font-normal">镜像</th>
                  <th className="text-left py-1.5 font-normal">状态</th>
                  <th className="text-left py-1.5 font-normal">端口</th>
                  <th className="text-left py-1.5 font-normal">应用</th>
                  <th className="text-right py-1.5 pr-2 font-normal">操作</th>
                </tr>
              </thead>
              <tbody>
                {containers.map(c => (
                  <tr key={c.id} className="border-b last:border-b-0 hover:bg-[var(--color-accent)]/30">
                    <td className="py-1.5 pl-2 font-mono">
                      <div>{c.name}</div>
                      <div className="text-[10px] text-muted-foreground">{c.shortId}</div>
                    </td>
                    <td className="py-1.5 max-w-[180px] truncate font-mono text-[11px]">{c.image}</td>
                    <td className="py-1.5">
                      <Badge variant="outline" className={STATE_BADGE[c.state] ?? ''}>
                        {c.state}
                      </Badge>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{c.status}</div>
                    </td>
                    <td className="py-1.5 max-w-[160px] truncate text-[11px]">{c.ports}</td>
                    <td className="py-1.5 text-[11px]">
                      {c.composeProject ? (
                        <>
                          <div>{c.composeProject}</div>
                          {c.composeService && (
                            <div className="text-[10px] text-muted-foreground">{c.composeService}</div>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-right">
                      <ContainerActions
                        container={c}
                        pendingAction={pendingAction}
                        onAct={(action) => containerActionMutation.mutate({ cid: c.id, action })}
                        onLog={() => onPickLog(c.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ContainerActions({
  container,
  pendingAction,
  onAct,
  onLog,
}: {
  container: ContainerView
  pendingAction: string | null
  onAct: (action: ContainerAction) => void
  onLog: () => void
}) {
  const running = container.state === 'running'
  const paused = container.state === 'paused'
  const busy = (a: ContainerAction) => pendingAction === `${a}:${container.id}`
  return (
    <div className="inline-flex gap-1">
      <Button size="sm" variant="ghost" onClick={onLog} title="查看日志">
        <FileText className="size-3.5" />
      </Button>
      {running ? (
        <>
          <Button size="sm" variant="ghost" disabled={busy('restart')}
                  onClick={() => onAct('restart')} title="重启">
            <RotateCcw className="size-3.5" />
          </Button>
          {paused ? (
            <Button size="sm" variant="ghost" disabled={busy('unpause')}
                    onClick={() => onAct('unpause')} title="恢复">
              <Play className="size-3.5" />
            </Button>
          ) : (
            <Button size="sm" variant="ghost" disabled={busy('pause')}
                    onClick={() => onAct('pause')} title="暂停">
              <Pause className="size-3.5" />
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={busy('stop')}
                  onClick={() => onAct('stop')} title="停止">
            <Square className="size-3.5" />
          </Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" disabled={busy('start')}
                onClick={() => onAct('start')} title="启动">
          <Play className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

function toMsg(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof Error) return e.message
  return String(e)
}
