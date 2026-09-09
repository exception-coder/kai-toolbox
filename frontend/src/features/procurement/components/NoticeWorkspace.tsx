import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { procurementApi } from '../api'
import { dateText, statusNames } from '../types'
import { WorkspaceState } from './WorkspaceState'
import { NoticeDetail } from './NoticeDetail'

export function NoticeWorkspace({ busy, useLlm }: { busy: boolean; useLlm: boolean }) {
  const [search, setSearch] = useState('')
  const [site, setSite] = useState('')
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const client = useQueryClient()
  const sites = useQuery({ queryKey: ['procurement', 'sites'], queryFn: procurementApi.sites })
  const query = useQuery({ queryKey: ['procurement', 'notices', search, site, status, page],
    queryFn: () => procurementApi.businessNotices(search, site, status, page), refetchInterval: busy ? 3000 : false })
  const run = useMutation({ mutationFn: (id: string) => procurementApi.start('', id, useLlm),
    onSuccess: () => client.invalidateQueries({ queryKey: ['procurement'] }) })
  const parse = useMutation({ mutationFn: (id: string) => procurementApi.start('', id, true, true),
    onSuccess: () => client.invalidateQueries({ queryKey: ['procurement'] }) })
  const download = useMutation({ mutationFn: () => procurementApi.exportNotices(search, site, status) })
  return <><div className="flex flex-wrap items-center justify-between gap-3"><h1>采集结果</h1>
    <Button variant="outline" disabled={download.isPending || !query.data?.total} onClick={() => download.mutate()} title="导出当前筛选下的全部记录">
      {download.isPending ? '正在导出…' : '导出 Excel'}</Button></div>
    <p className="procurement-description">展示当日链接登记的公告及业务字段。首次采集缓存页面，后续解析读取本地内容；空值表示原文未明确或尚未解析。</p>
    <div className="mb-5 grid gap-3 sm:grid-cols-3">
      <input aria-label="搜索公告" className="procurement-input" placeholder="搜索公告标题" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
      <select aria-label="筛选站点" className="procurement-input" value={site} onChange={e => { setSite(e.target.value); setPage(0) }}><option value="">全部站点</option>{sites.data?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <select aria-label="筛选采集状态" className="procurement-input" value={status} onChange={e => { setStatus(e.target.value); setPage(0) }}><option value="">全部采集状态</option>{['PENDING', 'SUCCESS', 'FAILED'].map(s => <option key={s} value={s}>{statusNames[s]}</option>)}</select>
    </div>
    {run.error && <p role="alert" className="mb-4 text-sm text-destructive">{run.error.message}</p>}
    {parse.error && <p role="alert" className="mb-4 text-sm text-destructive">{parse.error.message}</p>}
    {download.error && <p role="alert" className="mb-4 text-sm text-destructive">{download.error.message}</p>}
    {query.isPending || query.isError ? <WorkspaceState error={query.error} retry={() => void query.refetch()} /> : <>
      <div className="procurement-table-wrap"><table className="procurement-table procurement-business-table"><thead><tr><th>操作 / 状态</th>{query.data.fields.map(field => <th key={field.key} className="whitespace-nowrap">{field.label}</th>)}</tr></thead>
        <tbody>{query.data.items.map(({ notice: n, values }) => <tr key={n.id}>
          <td className="min-w-48"><div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setSelected(n.id)}>详情</Button>
            {!n.capturedAt && <Button variant="ghost" size="sm" disabled={busy || run.isPending} onClick={() => run.mutate(n.id)}>缓存页面</Button>}
            {n.capturedAt && <Button variant="ghost" size="sm" disabled={busy || parse.isPending} onClick={() => parse.mutate(n.id)}>解析缓存</Button>}
            <a href={n.url} target="_blank" rel="noreferrer" aria-label={`打开来源：${n.title}`} className="p-2"><ExternalLink size={14} /></a></div>
            <p className="mt-2 text-xs text-muted-foreground">{statusNames[n.captureStatus]} · {statusNames[n.parseStatus]}<br />{dateText(n.capturedAt)}</p>
            {n.error && <p className="mt-2 max-w-64 text-xs text-destructive">{n.error}</p>}</td>
          {query.data.fields.map(field => <td key={field.key} className="min-w-40 max-w-96 align-top"><div className="max-h-36 overflow-auto whitespace-pre-wrap break-words text-sm">
            {field.key === 'title' ? <button className="min-w-64 text-left font-medium hover:text-primary" onClick={() => setSelected(n.id)}>{values[field.key] || n.title}</button>
              : field.key === 'source_url' ? <a className="text-primary underline" href={n.url} target="_blank" rel="noreferrer">原公告</a> : values[field.key] || '—'}
          </div></td>)}
          </tr>)}</tbody></table></div>
      {!query.data.items.length && <div className="py-8 text-sm">没有匹配的公告。<Button variant="link" onClick={() => { setSearch(''); setSite(''); setStatus(''); setPage(0) }}>清除筛选</Button></div>}
      <div className="mt-5 flex items-center justify-between text-xs text-muted-foreground"><span>共 {query.data.total} 条 · 第 {page + 1} 页</span><div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</Button>
        <Button variant="outline" size="sm" disabled={(page + 1) * query.data.pageSize >= query.data.total} onClick={() => setPage(page + 1)}>下一页</Button></div></div>
    </>}
    {selected && <NoticeDetail id={selected} close={() => setSelected(null)} />}

  </>
}
