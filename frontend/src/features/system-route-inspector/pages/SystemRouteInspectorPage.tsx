import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, CircleHelp, Link2, Loader2, RefreshCw, Route, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils'
import { deleteProjectRouteBinding, inspectSystemRoute, listProjectRouteBindings, listSystemRouteCandidates, listWorkspaceProjectPaths, saveProjectRouteBinding } from '../api'
import type { RouteCheckStatus, SystemRouteInspection } from '../types'

const STATUS_LABEL: Record<SystemRouteInspection['overallStatus'], string> = {
  HEALTHY: '路由完整', DEGRADED: '部分缺失', UNVERIFIED: '运行态待核验', BROKEN: '路由中断',
}

const CHECK_LABEL: Record<RouteCheckStatus, string> = {
  PASS: '通过', WARNING: '注意', UNVERIFIED: '待核验', FAIL: '失败',
}

function tone(status: string): StatusTone {
  if (status === 'PASS' || status === 'HEALTHY' || status === 'VERIFIED') return 'success'
  if (status === 'FAIL' || status === 'BROKEN') return 'danger'
  if (status === 'UNVERIFIED') return 'info'
  return 'warning'
}

function routeError(error: unknown): string {
  return error instanceof Error ? error.message : '检测失败，请检查后端日志。'
}

export function SystemRouteInspectorPage() {
  const queryClient = useQueryClient()
  const candidatesQuery = useQuery({ queryKey: ['system-route-candidates'], queryFn: listSystemRouteCandidates })
  const bindingsQuery = useQuery({ queryKey: ['project-route-bindings'], queryFn: listProjectRouteBindings })
  const workspacePathsQuery = useQuery({ queryKey: ['system-route-workspace-paths'], queryFn: listWorkspaceProjectPaths })
  const [project, setProject] = useState('')
  const [module, setModule] = useState('')
  const [url, setUrl] = useState('')
  const [bindingPath, setBindingPath] = useState('')
  const [aliases, setAliases] = useState('')
  const [inspection, setInspection] = useState<SystemRouteInspection | null>(null)

  const candidates = candidatesQuery.data ?? []
  const bindings = bindingsQuery.data ?? []
  const selectedBinding = useMemo(
    () => bindings.find(item => item.projectKey === project),
    [bindings, project],
  )

  useEffect(() => {
    if (!project && candidates.length > 0) setProject(candidates[0].projectKey)
  }, [candidates, project])

  useEffect(() => {
    setBindingPath(selectedBinding?.projectPath ?? '')
    setAliases(selectedBinding?.aliases.join(', ') ?? '')
    setInspection(null)
  }, [selectedBinding, project])

  const inspectionMutation = useMutation({
    mutationFn: () => inspectSystemRoute({ project, module, url }),
    onSuccess: setInspection,
  })

  const refreshBindings = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['system-route-candidates'] }),
      queryClient.invalidateQueries({ queryKey: ['project-route-bindings'] }),
    ])
  }

  const saveMutation = useMutation({
    mutationFn: () => saveProjectRouteBinding(
      project,
      bindingPath.trim(),
      aliases.split(',').map(value => value.trim()).filter(Boolean),
    ),
    onSuccess: refreshBindings,
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteProjectRouteBinding(project),
    onSuccess: refreshBindings,
  })

  const checks = inspection?.checks ?? []
  const passed = checks.filter(check => check.status === 'PASS').length
  const matchedModules = inspection?.route?.matchedModules ?? []
  const allModules = inspection?.route?.modules ?? []
  const evidenceProjects = inspection?.route
    ? [inspection.route.evidenceScope.primary, ...inspection.route.evidenceScope.relatedProjects]
    : []

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-7 flex flex-col gap-4 border-b border-[var(--color-border)] pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
            <Route className="size-3.5" /> Forge routing observability
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-foreground)] sm:text-3xl">系统路由检测</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">
            用项目名、模块名和 URL 验证源码、业务知识、关联项目、Graphify 前置坐标与运行时 Tool 是否真正贯通。
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--color-muted-foreground)]">
          <span>{candidates.length} 个已登记知识项目</span>
          <span className="h-3 w-px bg-[var(--color-border)]" />
          <span>{bindings.filter(item => item.sourceAvailable).length} 个源码可达</span>
        </div>
      </header>

      <section aria-label="检测条件" className="grid gap-3 border-b border-[var(--color-border)] pb-6 md:grid-cols-[minmax(180px,0.8fr)_minmax(180px,0.8fr)_minmax(260px,1.4fr)_auto]">
        <label className="grid gap-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">
          项目 / 系统
          <select
            value={project}
            onChange={event => setProject(event.target.value)}
            className="h-[var(--density-control-height)] rounded-md border bg-[var(--color-background)] px-3 text-sm text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            {candidates.map(candidate => (
              <option key={candidate.projectKey} value={candidate.projectKey}>{candidate.displayName} · {candidate.projectKey}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">
          模块名称（可选）
          <Input value={module} onChange={event => setModule(event.target.value)} placeholder="例如：采购订单" />
        </label>
        <label className="grid gap-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">
          URL（可选）
          <Input value={url} onChange={event => setUrl(event.target.value)} placeholder="例如：/purchase/order/list.action" />
        </label>
        <Button className="self-end" onClick={() => inspectionMutation.mutate()} disabled={!project || inspectionMutation.isPending}>
          {inspectionMutation.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          执行检测
        </Button>
      </section>

      {(candidatesQuery.isError || bindingsQuery.isError) && (
        <div className="mt-6 border-l-2 border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-4 py-3 text-sm text-[var(--color-danger-soft-foreground)]">
          无法加载项目路由目录：{routeError(candidatesQuery.error ?? bindingsQuery.error)}
        </div>
      )}

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-8">
          {inspection ? (
            <>
              <div className="flex flex-col gap-4 border-b border-[var(--color-border)] pb-6 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={tone(inspection.overallStatus)}>{STATUS_LABEL[inspection.overallStatus]}</StatusBadge>
                    <span className="text-xs tabular-nums text-[var(--color-muted-foreground)]">{passed}/{checks.length} 项通过</span>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-[var(--color-foreground)]">{inspection.summary}</h2>
                  {inspection.route && <p className="mt-1 break-all font-mono text-xs text-[var(--color-muted-foreground)]">{inspection.route.projectPath}</p>}
                </div>
                <div className="text-left text-xs text-[var(--color-muted-foreground)] sm:text-right">
                  <div>绑定来源：{inspection.route?.bindingSource ?? '未解析'}</div>
                  <div className="mt-1">运行态协议：{inspection.runtimeTools.protocolVersion ?? '不可用'}</div>
                </div>
              </div>

              <div>
                <SectionTitle title="路由检查" meta={`${checks.length} 项确定性检查`} />
                <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">
                  {checks.map(check => (
                    <article key={check.code} className="grid gap-3 py-4 md:grid-cols-[150px_minmax(0,1fr)_minmax(180px,0.55fr)]">
                      <div><StatusBadge tone={tone(check.status)}>{CHECK_LABEL[check.status]}</StatusBadge></div>
                      <div>
                        <h3 className="text-sm font-medium text-[var(--color-foreground)]">{check.title}</h3>
                        <p className="mt-1 text-sm leading-5 text-[var(--color-muted-foreground)]">{check.explanation}</p>
                        {check.evidence && <p className="mt-2 break-all font-mono text-[11px] text-[var(--color-muted-foreground)]">{check.evidence}</p>}
                      </div>
                      <div className="text-xs leading-5 text-[var(--color-muted-foreground)]">
                        {check.recoveryAction ? <><span className="font-medium text-[var(--color-foreground)]">恢复动作</span><br />{check.recoveryAction}</> : '无需操作'}
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="grid gap-8 lg:grid-cols-2">
                <div>
                  <SectionTitle title="模块代码坐标" meta={module ? `${matchedModules.length} 个命中 / ${allModules.length} 个已登记` : `${allModules.length} 个已登记`} />
                  <div className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
                    {(module ? matchedModules : allModules).slice(0, 12).map(item => (
                      <div key={item.key} className="py-3">
                        <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium">{item.name}</span><span className="font-mono text-[10px] text-[var(--color-muted-foreground)]">{item.key}</span></div>
                        <p className="mt-1 break-all font-mono text-[11px] text-[var(--color-muted-foreground)]">{item.codePath || item.webPaths[0] || '仅有知识定义，暂无代码路径'}</p>
                      </div>
                    ))}
                    {(module ? matchedModules : allModules).length === 0 && <EmptyLine text="没有匹配到模块坐标；请核对 modules.json 中的 key 或名称。" />}
                  </div>
                </div>
                <div>
                  <SectionTitle title="证据项目范围" meta={`${evidenceProjects.length} 个项目`} />
                  <div className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)]">
                    {evidenceProjects.map(item => (
                      <div key={`${item.projectKey}-${item.relation}`} className="flex items-start justify-between gap-4 py-3">
                        <div><div className="text-sm font-medium">{item.projectKey}</div><div className="mt-1 break-all font-mono text-[11px] text-[var(--color-muted-foreground)]">{item.projectPath || '未绑定本地源码'}</div></div>
                        <StatusBadge tone={item.projectPath ? 'success' : 'warning'}>{item.relation}</StatusBadge>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-8 lg:grid-cols-2">
                <CompactList title="运行时 MCP Tools" items={inspection.runtimeTools.tools.map(item => `${item.server} / ${item.tool}`)} empty="Sidecar 不可达，当前只能完成静态路由检测。" />
                <CompactList title="关联 Forge Tools" items={inspection.menuTools.map(item => `${item.name} · ${item.route}`)} empty="没有按系统别名匹配到 Forge ToolDescriptor。" />
              </div>
            </>
          ) : (
            <div className="flex min-h-[360px] flex-col justify-center border-y border-[var(--color-border)] py-14">
              <CircleHelp className="size-5 text-[var(--color-muted-foreground)]" />
              <h2 className="mt-4 text-lg font-semibold">等待一次完整路由检测</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--color-muted-foreground)]">选择项目即可验证基础链路；再填写模块名或 URL，可进一步检查业务代码坐标与确定性 URL 路由。</p>
            </div>
          )}
          {inspectionMutation.isError && <ErrorLine error={inspectionMutation.error} />}
        </div>

        <aside className="h-fit border-t border-[var(--color-border-strong)] pt-5 xl:sticky xl:top-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">本机源码绑定</h2>
            <StatusBadge tone={selectedBinding?.sourceAvailable ? 'success' : 'warning'}>
              {selectedBinding?.sourceAvailable ? '源码可达' : '待绑定'}
            </StatusBadge>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--color-muted-foreground)]">团队仓库只保存 projectKey；绝对路径保存在本机 SQLite，不会写入 team-tools。</p>
          <div className="mt-5 space-y-4">
            <label className="grid gap-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">源码根目录<Input list="system-route-workspace-paths" value={bindingPath} onChange={event => setBindingPath(event.target.value)} placeholder="D:\\Users\\...\\project" /></label>
            <datalist id="system-route-workspace-paths">
              {(workspacePathsQuery.data ?? []).map(path => <option key={path} value={path} />)}
            </datalist>
            <label className="grid gap-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">系统别名（逗号分隔）<Input value={aliases} onChange={event => setAliases(event.target.value)} placeholder="ERP, 优你, yoooni" /></label>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={!project || !bindingPath.trim() || saveMutation.isPending}><Save />保存绑定</Button>
              {selectedBinding?.explicit && <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}><Trash2 />恢复自动发现</Button>}
            </div>
            {(saveMutation.isError || deleteMutation.isError) && <ErrorLine error={saveMutation.error ?? deleteMutation.error} />}
          </div>
          <div className="mt-7 border-t border-[var(--color-border)] pt-5">
            <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-foreground)]">绑定事实</h3>
            <dl className="mt-3 space-y-3 text-xs">
              <Fact label="projectKey" value={project || '—'} />
              <Fact label="来源" value={selectedBinding?.source ?? '—'} />
              <Fact label="知识库" value={selectedBinding?.knowledgeAvailable ? '已找到 modules.json' : '未找到'} />
              <Fact label="说明" value={selectedBinding?.message ?? '选择一个项目查看绑定状态'} />
            </dl>
          </div>
          <div className="mt-7 border-t border-[var(--color-border)] pt-5 text-xs leading-5 text-[var(--color-muted-foreground)]">
            <div className="flex gap-2"><Link2 className="mt-0.5 size-3.5 shrink-0" /><span>Graphify 在源码根确定后负责代码检索；它不能替代项目绑定、modules.json 或跨项目拓扑。</span></div>
          </div>
        </aside>
      </section>
    </main>
  )
}

function SectionTitle({ title, meta }: { title: string; meta: string }) {
  return <div className="mb-3 flex items-baseline justify-between gap-4"><h2 className="text-sm font-semibold">{title}</h2><span className="text-xs text-[var(--color-muted-foreground)]">{meta}</span></div>
}

function EmptyLine({ text }: { text: string }) {
  return <p className="py-4 text-sm text-[var(--color-muted-foreground)]">{text}</p>
}

function CompactList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <div><SectionTitle title={title} meta={`${items.length} 项`} /><div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">{items.length ? items.map(item => <div key={item} className="flex items-center gap-2 py-3 text-xs"><ChevronRight className="size-3 text-[var(--color-muted-foreground)]" /><span className="break-all font-mono">{item}</span></div>) : <EmptyLine text={empty} />}</div></div>
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-3"><dt className="text-[var(--color-muted-foreground)]">{label}</dt><dd className="break-all text-right text-[var(--color-foreground)]">{value}</dd></div>
}

function ErrorLine({ error }: { error: unknown }) {
  return <div className={cn('mt-4 flex gap-2 border-l-2 border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-3 py-2 text-xs text-[var(--color-danger-soft-foreground)]')}><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{routeError(error)}</div>
}
