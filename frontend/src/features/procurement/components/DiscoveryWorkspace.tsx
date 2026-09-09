import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { procurementApi } from '../api'
import { statusNames } from '../types'
import { WorkspaceState } from './WorkspaceState'
import { DAILY_DISCOVERY_SITE } from '../discoverySite'

export function DiscoveryWorkspace({ busy }: { busy: boolean }) {
  const client = useQueryClient()
  const batches = useQuery({ queryKey: ['procurement', 'discovery'], queryFn: procurementApi.discovery, refetchInterval: 3000 })
  const [params, setParams] = useSearchParams()
  const sites = useQuery({ queryKey: ['procurement', 'sites'], queryFn: procurementApi.sites })
  const siteId = params.get('site') || DAILY_DISCOVERY_SITE
  const supported = siteId === DAILY_DISCOVERY_SITE
  const selectedSite = sites.data?.find(site => site.id === siteId)
  const [region, setRegion] = useState('MATCHED')
  const [page, setPage] = useState(0)
  const id = supported ? (batches.data?.find(item => item.id === params.get('batch'))?.id || batches.data?.[0]?.id || '') : ''
  const active = batches.data?.find(batch => batch.id === id)
  const running = active?.status === 'RUNNING'
  const batch = useQuery({ queryKey: ['procurement', 'discovery', id, active?.status], queryFn: () => procurementApi.discoveryBatch(id), enabled: !!id, refetchInterval: running ? 3000 : false })
  const links = useQuery({ queryKey: ['procurement', 'discovery-links', id, region, page, active?.status], queryFn: () => procurementApi.discoveryLinks(id, region, page), enabled: !!id, refetchInterval: running ? 3000 : false })
  const details = useMutation({ mutationFn: (parseOnly: boolean) => procurementApi.discoveryDetails(id, parseOnly),
    onSuccess: () => client.invalidateQueries({ queryKey: ['procurement'] }) })
  return <><h1>当日链接</h1><p className="procurement-description">先查询列表并完整翻页，再采集详情，最后按关键词规则和数据结构解析。</p>
    <label className="procurement-form-label mb-5 block max-w-xl">采集平台（采集站点）
      <select className="procurement-input" value={siteId} disabled={!sites.data} onChange={event => {
        setParams({ site: event.target.value }); setPage(0); setRegion('MATCHED'); details.reset()
      }}>
        {!sites.data && <option value={siteId}>正在加载采集站点</option>}
        {sites.data && !selectedSite && <option value={siteId}>站点不存在</option>}
        {sites.data?.map(site => <option value={site.id} key={site.id}>{site.name}{!site.enabled ? ' · 已停用' : site.id !== DAILY_DISCOVERY_SITE ? ' · 当日采集待适配' : ''}</option>)}
      </select></label>
    {sites.isError && <WorkspaceState error={sites.error} retry={() => void sites.refetch()} />}
    {!supported ? <p className="border-y border-border py-6 text-sm">{selectedSite?.name || '所选站点'}尚未适配当日查询与完整翻页。请切换到全国公共资源交易平台，或前往<Link className="text-primary underline" to="/tools/procurement/sites">采集站点</Link>查看入口配置。</p> : <>
    <div className="border-y border-border py-4 text-sm leading-7"><p>{selectedSite?.name || '全国公共资源交易平台'} · 发布时间：北京时间当天</p>
      <p className="text-muted-foreground">站内数据来源：省平台、央企招投标、商务部、财政部、自然资源部、国资委</p>
      <p className="text-muted-foreground">河北、北京、山西、内蒙古、天津 · 只按省份筛选，市与来源平台不限</p>
      <p className="mt-2 text-xs text-muted-foreground">不提供省份筛选的来源按列表地区核验；缺少地区依据的链接单列待确认，不自动进入五省详情任务。业务和信息类型使用页面可用的不限范围。</p>
    </div>
    {batches.isPending || batches.isError ? <WorkspaceState error={batches.error} retry={() => void batches.refetch()} />
      : !id ? <p className="py-8 text-sm">尚无链接发现批次。点击右上角“采集当日链接”开始，过程中不会采集详情或调用 LLM。</p>
        : <><div className="my-5 flex flex-wrap items-end gap-3"><label className="procurement-form-label min-w-0 w-full sm:w-auto sm:flex-1">发现批次
          <select className="procurement-input" value={id} onChange={e => { setParams({ site: siteId, batch: e.target.value }); setPage(0); details.reset() }}>
            {batches.data.map(item => <option value={item.id} key={item.id}>{item.date} · {statusNames[item.status] || item.status} · {new Date(item.create_time).toLocaleTimeString()}</option>)}</select></label>
          <Button variant="outline" disabled={running || busy || details.isPending || !active?.matched} onClick={() => details.mutate(false)}>2. 采集本批详情</Button>
          <Button variant="outline" disabled={running || busy || details.isPending || !active?.matched} onClick={() => details.mutate(true)}>3. 解析本批正文</Button></div>
          {details.error && <p role="alert" className="mb-4 text-sm text-destructive">{details.error.message}</p>}
          {details.isSuccess && <p role="status" className="mb-4 text-sm">任务已启动，可到<Link className="text-primary underline" to="/tools/procurement/notices">采集结果</Link>查看正文和解析字段。</p>}
          <div className="mb-5 flex flex-wrap gap-5 text-sm"><span>{statusNames[active?.status || ''] || active?.status}</span><span>已读 {active?.pages ?? 0} 页</span><span>五省链接 {active?.matched ?? 0}</span><span>地区待确认 {active?.unknown ?? 0}</span></div>
          {batch.error ? <WorkspaceState error={batch.error} retry={() => void batch.refetch()} /> : <>
            {batch.data?.error && <p role="alert" className="mb-4 text-sm text-destructive">{batch.data.error}。已取得链接保留，可重新采集。</p>}
            <details className="mb-6 border-b border-border pb-4" open={running || active?.status === 'PARTIAL' || active?.status === 'FAILED'}><summary className="cursor-pointer text-sm">查询进度与完整性 · {batch.data?.scopes?.filter(scope => scope.status === 'COMPLETED').length ?? 0} 组完成</summary>
              <div className="mt-3 divide-y divide-border">{batch.data?.scopes?.map(scope => <div className="py-3 text-xs" key={`${scope.source}-${scope.province}`}>
                <p>{scope.source} · {scope.province || '来源不提供省份筛选'} · {statusNames[scope.status] || scope.status} · {scope.pages} 页 / {scope.seen} 条</p>
                {scope.error && <p className="mt-2 whitespace-pre-wrap text-destructive">{scope.error}</p>}</div>)}</div></details>
          </>}
          <div className="mb-4 flex flex-wrap gap-2">{[['MATCHED', '五省链接'], ['REGION_UNKNOWN', '地区待确认'], ['EXCLUDED', '其他省份']].map(([key, label]) =>
            <Button variant={region === key ? 'secondary' : 'ghost'} aria-pressed={region === key} key={key} onClick={() => { setRegion(key); setPage(0) }}>{label}</Button>)}</div>
          {links.isPending || links.isError ? <WorkspaceState error={links.error} retry={() => void links.refetch()} /> : <>
            <div className="procurement-table-wrap"><table className="procurement-table"><thead><tr><th>公告链接</th><th>数据来源</th><th>省份</th><th>发布日期</th></tr></thead>
              <tbody>{links.data.items.map(link => <tr key={link.url}><td><a className="font-medium hover:text-primary" href={link.url} target="_blank" rel="noreferrer">{link.title}</a>
                <p className="mt-2 text-xs text-muted-foreground">第 {link.page} 页 · {link.metadata}</p></td><td className="whitespace-nowrap">{link.source}</td><td className="whitespace-nowrap">{link.province || '待确认'}</td><td className="whitespace-nowrap">{link.date}</td></tr>)}</tbody></table>
              {!links.data.total && <p className="py-6 text-sm text-muted-foreground">{running ? '正在读取列表，请稍候。' : '本批此分类没有链接；请结合查询完成状态判断是否为零结果。'}</p>}</div>
            <div className="mt-4 flex items-center justify-between gap-3 text-sm"><span>共 {links.data.total} 条 · 第 {page + 1} 页</span><div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={!page} onClick={() => setPage(page - 1)}>上一页</Button><Button variant="outline" size="sm" disabled={(page + 1) * 50 >= links.data.total} onClick={() => setPage(page + 1)}>下一页</Button></div></div>
          </>}
        </>}
    </>}
  </>
}
