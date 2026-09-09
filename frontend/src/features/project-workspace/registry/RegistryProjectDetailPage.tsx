import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Play, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getProject, initializeProject } from './api'
import { ReadinessLabel, RegistryError } from './RegistryStates'
import { ProjectRegistrationForm } from './ProjectRegistrationForm'
import { AssetPanel, InitializationProgress, ProfileOverview } from './SystemProfilePanels'
import { SystemTasksPanel } from './SystemTasksPanel'
import { SystemDomainsPanel } from './SystemDomainsPanel'
import { GraphifyGraphModal } from '../components/GraphifyGraphModal'
import { SystemInitializationGuide } from './SystemInitializationGuide'

const tabs = ['概览', '代码智能', '业务域', '任务', '验证', '环境', '设置'] as const
type Tab = typeof tabs[number]

export function RegistryProjectDetailPage() {
  const { projectId = '' } = useParams()
  const [tab, setTab] = useState<Tab>('概览')
  const [graphOpen, setGraphOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const cache = useQueryClient()
  const query = useQuery({ queryKey: ['registry-project', projectId], queryFn: () => getProject(projectId),
    refetchInterval: query => query.state.data?.project.state === 'INITIALIZING' ? 2000 : false,
  })
  const init = useMutation({ mutationFn: (mode: 'FULL' | 'SYNC') => initializeProject(projectId, mode),
    onSuccess: async () => { setTab('概览'); await refresh() },
  })
  async function refresh() {
    await Promise.all([cache.invalidateQueries({ queryKey: ['registry-project', projectId] }), cache.invalidateQueries({ queryKey: ['project-registry'] })])
  }
  const detail = query.data
  const project = detail?.project
  const running = project?.state === 'INITIALIZING' || init.isPending
  const asset = (kind: string) => detail?.profile?.assets.find(item => item.kind === kind)
  return <main className="mx-auto w-full max-w-7xl space-y-8 px-6 py-8 md:px-12">
    <Link to="/tools/project-workspace" className="inline-flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]"><ArrowLeft className="size-3" />项目库</Link>
    <RegistryError error={query.error} retry={() => void query.refetch()} />
    {query.isLoading && <p role="status" className="text-sm">正在读取系统画像…</p>}
    {detail && project && <>
      <header className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-4"><h1 className="text-2xl font-semibold tracking-tight">{project.metadata.name}</h1><ReadinessLabel state={project.state} /></div>
        <p className="mt-3 break-all text-xs text-[var(--color-muted-foreground)]">{project.metadata.localPath}</p>
        <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">{project.metadata.owner || '未设置负责团队'} · {project.profileVersion ? `Profile v${project.profileVersion}` : '尚未初始化'}</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => init.mutate('SYNC')} disabled={running || !project.profileVersion}><RefreshCw className="size-3" />增量同步</Button>
          <Button size="sm" onClick={() => init.mutate('FULL')} disabled={running}><Play className="size-3" />{running ? '初始化中…' : project.profileVersion ? '重新完整初始化' : '完整初始化'}</Button></div>
      </header>
      <RegistryError error={init.error} />
      <nav className="flex gap-1 overflow-x-auto border-b border-[var(--color-border)] pb-3" aria-label="项目详情区域">{tabs.map(item => <Button key={item} className="shrink-0" variant={tab === item ? 'secondary' : 'ghost'} size="sm" aria-current={tab === item ? 'page' : undefined} onClick={() => setTab(item)}>{item}</Button>)}</nav>
      {tab === '概览' && <div className="grid gap-12 xl:grid-cols-2"><div className="space-y-8">
        {detail.profile ? <ProfileOverview profile={detail.profile} /> : <section className="space-y-3"><h2 className="font-semibold">系统已登记，等待初始化</h2><p className="text-sm leading-relaxed text-[var(--color-muted-foreground)]">Full Init 将扫描工程、检查环境与 Graphify、发现规则和验证入口，生成可供 Agent 使用的系统画像。</p><Button onClick={() => init.mutate('FULL')} disabled={running}>开始 Full Init</Button></section>}
        {detail.profile && <AssetPanel asset={asset('EXECUTION')} />}
      </div><div>{detail.runs[0] ? <InitializationProgress run={detail.runs[0]} /> : <p className="text-sm text-[var(--color-muted-foreground)]">初始化进度将在这里显示，刷新页面不会丢失运行记录。</p>}</div></div>}
      {tab === '代码智能' && <div className="space-y-6"><AssetPanel asset={asset('CODE')} />{asset('CODE')?.sources.length ? <Button variant="outline" onClick={() => setGraphOpen(true)}>打开 Graphify 图谱</Button> : null}</div>}
      {tab === '业务域' && <SystemDomainsPanel projectId={projectId} />}
      {tab === '任务' && <SystemTasksPanel detail={detail} />}
      {tab === '验证' && <AssetPanel asset={asset('VERIFICATION')} />}
      {tab === '环境' && <div className="space-y-8"><AssetPanel asset={asset('PROJECT')} /><div className="flex flex-wrap gap-4">
        {([['开发环境', project.metadata.devUrl], ['测试环境', project.metadata.testUrl]] as const).filter(([, url]) => /^https?:\/\//.test(url)).map(([label, url]) => <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm underline underline-offset-4">{label}<ExternalLink className="size-3" /></a>)}</div></div>}
      {tab === '设置' && <section className="space-y-6"><h2 className="font-semibold">系统基础信息</h2>{saved && <p role="status" className="text-sm">设置已保存，请同步画像以反映最新配置。</p>}{running ? <p className="text-sm">初始化期间暂不可修改设置，请等待运行完成。</p> : <ProjectRegistrationForm key={project.updatedAt} project={project} onSaved={() => { setSaved(true); void refresh() }} />}</section>}
      {tab === '概览' && <SystemInitializationGuide />}
      <GraphifyGraphModal open={graphOpen} projectPath={project.metadata.localPath} projectName={project.metadata.name} onClose={() => setGraphOpen(false)} />
    </>}
  </main>
}
