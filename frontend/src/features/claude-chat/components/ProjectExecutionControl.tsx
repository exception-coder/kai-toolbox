import { useId } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/api'

interface Control {
  project: string
  enabled: boolean
  revision: number
  changedAt: string | null
  actor: string | null
}

/** 项目范围的开发者控制，不受当前 writer 或监督运行状态约束。 */
export function ProjectExecutionControl({ sessionId }: { sessionId: string }) {
  const id = useId()
  const client = useQueryClient()
  const key = ['project-execution-control', sessionId]
  const endpoint = `/claude-chat/sessions/${encodeURIComponent(sessionId)}/execution-control`
  const query = useQuery({ queryKey: key, queryFn: () => http<Control>(endpoint), refetchInterval: 5000 })
  const update = useMutation({
    mutationFn: (control: Control) => http<Control>(endpoint, { method: 'PUT', body: JSON.stringify({
      project: control.project, expectedRevision: control.revision, enabled: !control.enabled,
      reason: `开发者在自动监督面板${control.enabled ? '关闭' : '启用'}项目编码门禁`,
    }) }),
    onSuccess: data => {
      client.setQueryData(key, data)
      void client.invalidateQueries({ queryKey: ['project-execution-control'] })
    },
    onError: () => { void query.refetch() },
  })
  const data = query.data
  return <section className="min-w-0 border-t border-[var(--color-border)] py-3" aria-labelledby={id}>
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h3 id={id} className="text-xs font-medium">项目编码门禁</h3>
        <p className="mt-1 break-all text-[11px] text-[var(--color-muted-foreground)]">{data?.project ?? '正在读取项目控制状态…'}</p>
      </div>
      <button type="button" role="switch" aria-checked={data?.enabled ?? true} aria-labelledby={id}
        disabled={!data || query.isError || update.isPending} onClick={() => data && update.mutate(data)}
        className="min-h-11 shrink-0 rounded-md border border-[var(--color-border)] px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50">
        {update.isPending ? '保存中…' : data ? data.enabled ? '已启用 · 点击关闭' : '已关闭 · 点击启用' : '读取中'}
      </button>
    </div>
    <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
      同项目所有会话共用。关闭后，写入锁、文件范围、分支及规格/设计/验证前置检查不再阻断编码。
      原执行记录保留，未做的测试不会变为通过；开发结束后交接验收，不自动归档。重启和资源访问授权不变。
    </p>
    {data && <p role="status" className="mt-1 text-xs">{data.enabled ? '检查已启用；原执行按当前证据继续校验。' : '开发者自主控制；下次工具调用生效，无需重启。已暂停的监督任务需手动恢复。'}</p>}
    {(query.isError || update.isError) && <p role="alert" className="mt-2 text-xs text-amber-700 dark:text-amber-400">
      {update.isError ? '保存结果待核对，请刷新实际状态。' : '无法读取控制状态。'}
      <button type="button" className="ml-2 min-h-11 underline" onClick={() => { update.reset(); void query.refetch() }}>刷新状态</button>
    </p>}
  </section>
}
