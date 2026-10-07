import { useId } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '@/lib/api'

interface Control {
  project: string
  enabled: boolean
  revision: number
  changedAt: string | null
  actor: string | null
  verificationCadence?: 'CHECKPOINT' | 'PER_TASK' | 'CODING_FIRST'
}

/** 项目范围的开发者控制，不受当前 writer 或监督运行状态约束。 */
export function ProjectExecutionControl({ sessionId, compact = false }: { sessionId: string; compact?: boolean }) {
  const id = useId()
  const client = useQueryClient()
  const key = ['project-execution-control', sessionId]
  const endpoint = `/claude-chat/sessions/${encodeURIComponent(sessionId)}/execution-control`
  const query = useQuery({ queryKey: key, queryFn: () => http<Control>(endpoint), refetchInterval: 5000 })
  const update = useMutation({
    mutationFn: ({ control, cadence }: { control: Control; cadence?: Control['verificationCadence'] }) => http<Control>(endpoint, { method: 'PUT', body: JSON.stringify({
      project: control.project, expectedRevision: control.revision, enabled: cadence ? control.enabled : !control.enabled,
      verificationCadence: cadence ?? control.verificationCadence,
      reason: cadence ? '开发者调整项目验证节奏' : `开发者在自动监督面板${control.enabled ? '关闭' : '启用'}项目编码门禁`,
    }) }),
    onSuccess: data => {
      client.setQueryData(key, data)
      void client.invalidateQueries({ queryKey: ['project-execution-control'] })
    },
    onError: () => { void query.refetch() },
  })
  const data = query.data
  const cadenceControl = <div className="mt-1 text-xs">
    <label className="flex flex-wrap items-center justify-between gap-x-3" htmlFor={`${id}-cadence`}>
      <span>验证方式</span>
      <select id={`${id}-cadence`} value={data?.verificationCadence ?? 'CHECKPOINT'}
        disabled={!data?.verificationCadence || query.isError || update.isPending}
        onChange={event => data && update.mutate({ control: data, cadence: event.target.value as Control['verificationCadence'] })}
        className="min-h-11 max-w-full rounded-md bg-transparent px-2 focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50">
        <option value="CODING_FIRST">编码优先 · 全部编码后手动验收</option>
        <option value="CHECKPOINT">标准验收 · 功能检查点</option>
        <option value="PER_TASK">逐任务验证</option>
      </select>
    </label>
    <p className="pb-2 leading-relaxed text-[var(--color-muted-foreground)]">
      {data && !data.verificationCadence ? '当前服务尚未支持验证节奏设置。' : data?.verificationCadence === 'CODING_FIRST'
        ? '同项目共用，下次派发生效。先完成全部编码，不自动编译、测试、构建或浏览器验收；实现完成即可推进，最后由开发者切回标准验收集中验证。当前轮和已排队指令不会被改写。'
        : '同项目共用，下次派发生效。完整功能完成后定向验收，复用未变证据。'}
    </p>
  </div>
  if (compact) return <section aria-labelledby={id} className="min-w-0">
    <div className="flex items-start justify-between gap-3">
      <details className="min-w-0 flex-1 text-xs text-[var(--color-muted-foreground)]">
        <summary id={id} className="min-h-11 cursor-pointer content-center focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">项目编码门禁</summary>
        <p className="break-all">{data?.project ?? '项目状态未读取'}</p>
        <p className="pb-2 pt-1 leading-relaxed">同项目所有会话共用。关闭后，写入锁、范围及治理前置检查不再阻断编码；记录保留，不代表验证通过。重启、资源和生产授权不变。已暂停的监督需手动恢复。</p>
      </details>
      <button type="button" role="switch" aria-labelledby={id} aria-checked={data?.enabled ?? false}
        disabled={!data || query.isError || update.isPending} onClick={() => data && update.mutate({ control: data })}
        className="min-h-11 shrink-0 rounded-md px-2 text-xs underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50">
        {update.isPending ? '保存中…' : query.isError ? '状态未知' : data ? data.enabled ? '已启用 · 关闭' : '已关闭 · 启用' : '读取中…'}
      </button>
    </div>
    {cadenceControl}
    {(query.isError || update.isError) && <p role="alert" className="text-xs text-amber-700 dark:text-amber-400">
      {update.isError ? '保存结果待核对。' : '控制状态读取失败。'}{data ? '当前显示上次已知状态。' : '尚无可用状态。'}
      <button type="button" className="ml-2 min-h-11 underline" onClick={() => { update.reset(); void query.refetch() }}>重试</button>
    </p>}
  </section>
  return <section className="min-w-0 border-t border-[var(--color-border)] py-3" aria-labelledby={id}>
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h3 id={id} className="text-xs font-medium">项目编码门禁</h3>
        <p className="mt-1 break-all text-[11px] text-[var(--color-muted-foreground)]">{data?.project ?? '正在读取项目控制状态…'}</p>
      </div>
      <button type="button" role="switch" aria-checked={data?.enabled ?? true} aria-labelledby={id}
        disabled={!data || query.isError || update.isPending} onClick={() => data && update.mutate({ control: data })}
        className="min-h-11 shrink-0 rounded-md border border-[var(--color-border)] px-3 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50">
        {update.isPending ? '保存中…' : data ? data.enabled ? '已启用 · 点击关闭' : '已关闭 · 点击启用' : '读取中'}
      </button>
    </div>
    {cadenceControl}
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
