import { useState } from 'react'
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LayoutDashboard, FileSearch, Globe2, ListFilter, Play, ArrowRight, Columns3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { procurementApi } from '../api'
import { dateText, statusNames } from '../types'
import { WorkspaceState } from '../components/WorkspaceState'
import { NoticeWorkspace } from '../components/NoticeWorkspace'
import { RuleWorkspace } from '../components/RuleWorkspace'
import { SiteWorkspace } from '../components/SiteWorkspace'
import { StructureWorkspace } from '../components/StructureWorkspace'
import { DiscoveryWorkspace } from '../components/DiscoveryWorkspace'
import { ExperienceWorkspace } from '../components/ExperienceWorkspace'
import { DAILY_DISCOVERY_SITE } from '../discoverySite'
import '../procurement.css'

const navigation = [
  { path: '', title: '概览', subtitle: '采集进度与快速入口', icon: LayoutDashboard },
  { path: '/links', title: '当日链接', subtitle: '查询、翻页与省份核验', icon: Globe2 },
  { path: '/notices', title: '采集结果', subtitle: '公告、字段与原文证据', icon: FileSearch },
  { path: '/sites', title: '采集站点', subtitle: '来源与采集入口', icon: Globe2 },
  { path: '/rules', title: '规则管理', subtitle: '判定目的、词组与例外', icon: ListFilter },
  { path: '/structure', title: '数据结构', subtitle: '目标字段与提取方式', icon: Columns3 },
  { path: '/experiences', title: '解析经验', subtitle: '正反例与样例回归', icon: FileSearch },
]

export default function ProcurementPage() {
  const path = useLocation().pathname.replace('/tools/procurement', '')
  const client = useQueryClient()
  const [useLlm, setUseLlm] = useState(false)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const siteId = params.get('site') || DAILY_DISCOVERY_SITE
  const sites = useQuery({ queryKey: ['procurement', 'sites'], queryFn: procurementApi.sites })
  const canDiscover = siteId === DAILY_DISCOVERY_SITE && sites.data?.some(site => site.id === siteId && site.enabled)
  const discovery = useQuery({ queryKey: ['procurement', 'discovery'], queryFn: procurementApi.discovery, refetchInterval: 3000 })
  const discovering = discovery.data?.some(batch => batch.status === 'RUNNING') ?? false
  const runs = useQuery({ queryKey: ['procurement', 'runs'], queryFn: procurementApi.runs, refetchInterval: 3000 })
  const busy = runs.data?.some(run => run.status === 'RUNNING') ?? false
  const overview = useQuery({ queryKey: ['procurement', 'overview'], queryFn: procurementApi.overview, refetchInterval: busy ? 3000 : false })
  const start = useMutation({ mutationFn: procurementApi.discoverToday,
    onSuccess: batch => { navigate(`/tools/procurement/links?site=${DAILY_DISCOVERY_SITE}&batch=${batch.id}`); return client.invalidateQueries({ queryKey: ['procurement'] }) } })
  return <div className="procurement-workspace">
    <header className="procurement-header">
      <div><p className="text-sm font-medium text-primary">信息采集 / 招采公告</p>
        <p className="mt-1 text-sm text-muted-foreground">汇集公开招采信息，按关键词规则解析并保留原文依据。</p></div>
      <div className="flex flex-wrap items-center gap-3">
        {(path === '/notices' || path === '/sites') && <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={useLlm}
          onChange={event => setUseLlm(event.target.checked)} />详情采集后智能解析</label>}
        <Button onClick={() => path === '/links' ? start.mutate() : navigate('/tools/procurement/links')} disabled={discovering || start.isPending || (path === '/links' && !canDiscover)}><Play size={15} />{discovering ? '正在发现链接' : path === '/links' ? '1. 采集当日链接' : '选择平台采集'}</Button>
      </div>
    </header>
    {start.error && <p className="py-3 text-sm text-destructive" role="alert">{start.error.message}</p>}
    <div className="procurement-layout">
      <aside className="procurement-nav"><p className="px-3 pb-4 text-xs text-muted-foreground">工作区</p>
        <nav aria-label="招采工作区">{navigation.map(item => <NavLink key={item.path} end to={`/tools/procurement${item.path}`}
          className={({ isActive }) => `procurement-nav-item ${isActive ? 'selected' : ''}`}>
          <item.icon size={17} /><span>{item.title}<small>{item.subtitle}</small></span>
        </NavLink>)}</nav></aside>
      <main className="procurement-content">
        {path === '/links' ? <DiscoveryWorkspace busy={busy} /> : path === '/notices' ? <NoticeWorkspace busy={busy} useLlm={useLlm} />
          : path === '/experiences' ? <ExperienceWorkspace /> : path === '/structure' ? <StructureWorkspace /> : path === '/rules' ? <RuleWorkspace /> : path === '/sites' ? <SiteWorkspace busy={busy} useLlm={useLlm} />
            : <><h1>工作概览</h1><p className="procurement-description">查看来源覆盖、采集状态和待核验记录。</p>
              {overview.isPending || overview.isError ? <WorkspaceState error={overview.error} retry={() => void overview.refetch()} />
                : <div className="procurement-metrics">{[
                  ['公告总数', overview.data.notices], ['已采集', overview.data.captured],
                  ['采集失败', overview.data.failed], ['待核验', overview.data.review],
                ].map(([label, value]) => <div key={label}><p>{label}</p><strong>{value}</strong></div>)}</div>}
              <section className="mt-8"><h2>采集作业</h2><p className="procurement-description">先发现当天公告链接，再按批次采集正文并解析。历史公告继续保留在采集结果中。</p>
                <NavLink to="/tools/procurement/links" className="procurement-entry"><FileSearch size={20} className="text-primary" />
                  <span>进入当日链接工作区<small>六个数据来源 → 五省链接 → 详情正文 → 规则与模型解析</small></span><ArrowRight size={18} /></NavLink>
              </section>
              <section className="mt-8"><div className="flex items-center justify-between"><h2>最近任务</h2>
                <span className="text-xs text-muted-foreground">{overview.data?.sites ?? '—'} 个启用站点 · {overview.data?.rules ?? '—'} 条启用规则</span></div>
                {runs.error ? <WorkspaceState error={runs.error} retry={() => void runs.refetch()} />
                  : !runs.data?.length ? <p className="py-6 text-sm text-muted-foreground">尚未运行详情采集。可先发现当天链接，再在批次中启动详情任务。</p>
                    : <div className="mt-4 divide-y divide-border">{runs.data.map(run => <div key={run.id} className="py-4">
                      <div className="flex flex-wrap justify-between gap-2 text-sm"><span>{statusNames[run.status] ?? run.status}</span>
                        <span className="tabular-nums text-muted-foreground">{run.processed} / {run.total} · 成功 {run.succeeded} · 失败 {run.failed}</span></div>
                      <p className="mt-1 text-xs text-muted-foreground">{dateText(run.createTime)}</p>
                      {run.status === 'RUNNING' && <progress className="mt-3 h-1 w-full" max={run.total} value={run.processed} aria-label="采集进度" />}
                      {run.error && <p className="mt-2 text-sm text-destructive">{run.error}</p>}
                    </div>)}</div>}
              </section></>}
      </main>
    </div>
  </div>
}
