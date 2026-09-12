import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RegistryError } from '../RegistryStates'
import { DiagnosticResults } from './DiagnosticResults'
import { ProjectRouteBindingEditor } from './ProjectRouteBindingEditor'
import type { DiagnosticProject } from './projectContext'
import { useProjectDiagnostics } from './useProjectDiagnostics'

export function ProjectContextDiagnostics({ scope }: { scope?: DiagnosticProject }) {
  const state = useProjectDiagnostics(scope)
  const { candidates, bindings, project, binding, inspection } = state
  const loading = candidates.isPending || bindings.isPending
  const error = candidates.error ?? bindings.error
  return <section className="space-y-6" aria-label="AI 上下文诊断">
    <header className="max-w-3xl space-y-3"><h2 className="text-lg font-semibold">AI 上下文诊断</h2>
      <p className="text-sm leading-6">确认 AI 能根据系统名称，找到正确的源码、业务知识和可用工具，减少查错项目、缺少上下文或工具不可用的问题。</p>
      <p className="text-sm leading-6 text-[var(--color-muted-foreground)]">初始化负责生成项目上下文；这里检查源码绑定、模块与页面定位、知识图谱及工具的访问链路。诊断通过不代表业务功能或接口测试通过。</p>
      {scope && <p className="break-all text-xs leading-5 text-[var(--color-muted-foreground)]">当前系统：{scope.name} · {scope.path}</p>}
    </header>
    <RegistryError error={error} retry={() => { void candidates.refetch(); void bindings.refetch() }} />
    {loading ? <p role="status" className="text-sm">正在读取项目上下文绑定…</p> : !error && <>
      {!candidates.data?.length && <p role="status" className="text-sm">尚未发现知识项目。请先在项目库登记系统并完成上下文初始化，再刷新诊断目录。</p>}
      <div className="grid items-end gap-4 md:grid-cols-3">
        <label className="grid gap-2 text-sm">知识项目<select className="h-10 w-full min-w-0 rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 text-sm" value={project} onChange={event => state.setSelection(event.target.value)}>
          <option value="">选择与源码对应的知识项目</option>{candidates.data?.map(item => <option key={item.projectKey} value={item.projectKey}>{item.displayName} · {item.projectKey}</option>)}
        </select></label>
        <label className="grid gap-2 text-sm">模块名称（可选）<Input value={state.module} onChange={event => state.setModule(event.target.value)} placeholder="例如：采购订单" /></label>
        <label className="grid gap-2 text-sm">页面 URL（可选）<Input value={state.url} onChange={event => state.setUrl(event.target.value)} placeholder="例如：/purchase/order/list.action" /></label>
      </div>
      {scope && !project && <p className="text-sm leading-6 text-[var(--color-muted-foreground)]">未找到与当前源码目录匹配的知识项目。请选择对应项目，在下方保存源码绑定。</p>}
      {state.mismatched && <p role="alert" className="border-l-2 border-[var(--color-warning)] pl-3 text-sm leading-6">所选知识项目尚未绑定当前系统的源码。请先确认并保存下方绑定，再执行诊断。</p>}
      <div className="flex flex-wrap items-center gap-3"><Button disabled={!project || state.mismatched || inspection.isFetching} onClick={() => void inspection.refetch()}>{inspection.isFetching ? '诊断中…' : '执行上下文诊断'}</Button>
        <Button variant="ghost" onClick={() => { void candidates.refetch(); void bindings.refetch() }}>刷新绑定</Button></div>
      <RegistryError error={inspection.error} retry={() => { if (project && !state.mismatched) void inspection.refetch() }} />
      {!state.mismatched && inspection.data ? <DiagnosticResults result={inspection.data} module={state.module} />
        : <p className="border-y border-[var(--color-border)] py-5 text-sm leading-6 text-[var(--color-muted-foreground)]">选择知识项目后执行诊断。结果会列出缺失能力、证据位置和下一步恢复动作。</p>}
      <ProjectRouteBindingEditor key={`${project}:${binding?.projectPath ?? ''}`} project={project} binding={binding} sourcePath={scope?.path} />
    </>}
  </section>
}
