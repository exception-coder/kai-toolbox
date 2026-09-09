import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { procurementApi } from '../api'
import type { Site } from '../types'
import { WorkspaceState } from './WorkspaceState'
import { WorkspaceDialog } from './WorkspaceDialog'

const names: Record<string, string> = { 'www.ggzy.gov.cn': '全国公共资源交易平台', 'ggzy.hebei.gov.cn': '河北公共资源交易',
  'ggzyfw.beijing.gov.cn': '北京公共资源交易', 'ggzy.yq.gov.cn': '阳泉公共资源交易', 'ggzy.qingdao.gov.cn': '青岛公共资源交易',
  'ggzyjyzx.lvliang.gov.cn': '吕梁公共资源交易', 'gcjs.ggzy.xzspglj.taiyuan.gov.cn': '太原工程建设交易', 'ggzyjy.dt.gov.cn': '大同公共资源交易' }

export function SiteWorkspace({ busy, useLlm }: { busy: boolean; useLlm: boolean }) {
  const query = useQuery({ queryKey: ['procurement', 'sites'], queryFn: procurementApi.sites })
  const [editing, setEditing] = useState<Site | null>(null)
  const [discovering, setDiscovering] = useState<Site | null>(null)
  const client = useQueryClient()
  const run = useMutation({ mutationFn: (id: string) => procurementApi.start(id, '', useLlm),
    onSuccess: () => client.invalidateQueries({ queryKey: ['procurement'] }) })
  return <><h1>采集站点</h1><p className="procurement-description">已导入 Excel 中的 8 个来源站点。采集已登记公告，或设置列表入口发现新公告。</p>
    {run.error && <p role="alert" className="mb-4 text-sm text-destructive">{run.error.message}</p>}
    {query.isPending || query.isError ? <WorkspaceState error={query.error} retry={() => void query.refetch()} />
      : <div className="divide-y divide-border border-t border-border">{query.data.map(site => <article key={site.id} className="py-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2>{site.name === site.host ? names[site.host] ?? site.name : site.name}</h2>
          <p className="mt-1 break-all text-xs text-muted-foreground">{site.host} · {site.enabled ? '已启用' : '已停用'}</p></div>
          <div className="flex flex-wrap gap-1"><Button variant="ghost" size="sm" onClick={() => setEditing(site)}>设置</Button>
            {site.host === 'www.ggzy.gov.cn' ? <Button variant="outline" size="sm" asChild><Link to="/tools/procurement/links">当日链接</Link></Button>
              : <Button variant="outline" size="sm" disabled={!site.enabled || !site.listUrl || busy} onClick={() => setDiscovering(site)}>发现公告</Button>}
            <Button variant="outline" size="sm" disabled={!site.enabled || busy || run.isPending} onClick={() => run.mutate(site.id)}>采集已登记详情</Button></div></div>
        <p className="mt-3 max-w-4xl text-sm leading-relaxed text-muted-foreground">{site.notes}</p>
        <p className="mt-2 break-all text-xs text-muted-foreground">列表入口：{site.host === 'www.ggzy.gov.cn' ? 'https://www.ggzy.gov.cn/deal/dealList.html（当日链接专用流程）' : site.listUrl || '未设置，可在“设置”中填写公告列表 URL'}</p>
      </article>)}</div>}
    {editing && <SiteEditor initial={editing} close={() => setEditing(null)} />}
    {discovering && <Discovery site={discovering} close={() => setDiscovering(null)} />}
  </>
}

function SiteEditor({ initial, close }: { initial: Site; close: () => void }) {
  const [site, setSite] = useState(initial)
  const client = useQueryClient()
  const save = useMutation({ mutationFn: () => procurementApi.saveSite(site),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['procurement'] }); close() } })
  return <WorkspaceDialog title="站点设置" description={initial.host} close={close}>
    <form className="grid gap-4" onSubmit={e => { e.preventDefault(); save.mutate() }}>
      <label className="procurement-form-label">站点名称<input className="procurement-input" required maxLength={120} value={site.name} onChange={e => setSite({ ...site, name: e.target.value })} /></label>
      <label className="procurement-form-label">公告列表 URL<input className="procurement-input" type="url" maxLength={2000} placeholder={`https://${site.host}/…`} value={site.listUrl} onChange={e => setSite({ ...site, listUrl: e.target.value })} /></label>
      <label className="procurement-form-label">站点说明<textarea className="procurement-input" rows={4} maxLength={4000} value={site.notes} onChange={e => setSite({ ...site, notes: e.target.value })} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={site.enabled} onChange={e => setSite({ ...site, enabled: e.target.checked })} />启用此站点</label>
      {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
      <Button className="justify-self-end" disabled={save.isPending}>{save.isPending ? '保存中' : '保存设置'}</Button>
    </form></WorkspaceDialog>
}

function Discovery({ site, close }: { site: Site; close: () => void }) {
  const discover = useQuery({ queryKey: ['procurement', 'discover', site.id], queryFn: () => procurementApi.discover(site.id), retry: false, staleTime: Infinity })
  const [added, setAdded] = useState<string[]>([])
  const client = useQueryClient()
  const add = useMutation({ mutationFn: (link: { url: string; title: string }) => procurementApi.addNotice(link.url, link.title),
    onSuccess: notice => { setAdded(previous => [...previous, notice.url]); void client.invalidateQueries({ queryKey: ['procurement', 'notices'] }) } })
  return <WorkspaceDialog title="发现公告" description="读取当前列表页的链接（最多 100 条），请确认标题后登记。分页可在站点设置中更换列表 URL。" close={close}>
    {discover.isPending || discover.isError ? <WorkspaceState error={discover.error} retry={() => void discover.refetch()} /> : <>
      {add.error && <p role="alert" className="mb-4 text-sm text-destructive">{add.error.message}</p>}
      {!discover.data.length && <p className="text-sm">没有发现可登记链接，请更换列表入口后重试。</p>}
      <div className="divide-y divide-border">{discover.data.map((link, index) => <div key={`${link.url}-${index}`} className="flex items-start gap-3 py-3 text-sm">
        <a href={link.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 break-words hover:text-primary">{link.title}</a>
        <Button size="sm" variant="outline" disabled={add.isPending || added.includes(link.url)} onClick={() => add.mutate(link)}>{added.includes(link.url) ? '已登记' : '登记'}</Button>
      </div>)}</div></>}
  </WorkspaceDialog>
}
