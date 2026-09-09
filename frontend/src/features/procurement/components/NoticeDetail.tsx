import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { procurementApi } from '../api'
import { dateText, statusNames } from '../types'
import { WorkspaceDialog } from './WorkspaceDialog'
import { WorkspaceState } from './WorkspaceState'
import { StructuredNotice } from './StructuredNotice'

interface Fact { field: string; value: string; evidence: string; section: string }
const fields: Record<string, string> = { province: '省份', city: '城市', county: '区县', project_number: '项目编号',
  notice_stage: '公告事件', scope_type: '招采对象', material: '材质', product: '产品', diameter: '管径',
  pipe_length: '管线长度', amount: '金额', owner: '业主', agent: '代理', winner: '中标人', contact: '联系方式', scene: '场景', negative_context: '排除依据' }

export function NoticeDetail({ id, close }: { id: string; close: () => void }) {
  const [tab, setTab] = useState('structured')
  const query = useQuery({ queryKey: ['procurement', 'notice', id], queryFn: () => procurementApi.notice(id) })
  const data = query.data
  const rules = useQuery({ queryKey: ['procurement', 'rules'], queryFn: procurementApi.rules })
  const structure = useQuery({ queryKey: ['procurement', 'structure'], queryFn: procurementApi.structure })
  const facts: Fact[] = data ? JSON.parse(data.analysis).facts ?? [] : []
  const diagnostics = data ? JSON.parse(data.analysis).diagnostics : undefined
  return <WorkspaceDialog title="公告详情" description="按配置结构核验采集结果、修正数据，并查看原文依据。" close={close}>
    {!data ? <WorkspaceState error={query.error} retry={() => void query.refetch()} /> : <>
      <h2 className="font-medium leading-relaxed">{data.title}</h2><p className="my-3 text-xs text-muted-foreground">{statusNames[data.captureStatus]} · {dateText(data.capturedAt)}</p>
      <a className="break-all text-sm text-primary underline" href={data.url} target="_blank" rel="noreferrer">打开原始公告</a>
      {data.error && <p role="alert" className="my-4 text-sm text-destructive">{data.error}{data.captureStatus === 'FAILED' && '。可返回列表点击“重采”重试。'}</p>}
      <div className="my-5 flex flex-wrap gap-2">{[['structured', '结构化数据'], ['analysis', '解析明细'], ['diagnostics', '解析诊断'], ['raw', '采集原文'], ['candidates', '代码候选'], ['source', 'Excel 历史对照']].map(([key, label]) =>
        <Button key={key} size="sm" variant={tab === key ? 'secondary' : 'ghost'} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</Button>)}</div>
      {tab === 'structured' && <StructuredNotice id={id} />}
      {tab === 'diagnostics' && <>
        <p className="mb-4 text-sm text-muted-foreground">EXTRACTED：已提取；NOT_EXTRACTED：未提取到；INVALID：校验不通过；NOT_PROCESSED：调用未完成。诊断不代表与人工标准答案对比后的准确率。</p>
        <a className="text-sm text-primary underline" href={`/api/procurement/notices/${encodeURIComponent(id)}/attempts`} target="_blank" rel="noreferrer">查看最近 50 次解析记录（JSON）</a>
        <div className="mt-4"><JsonEvidence value={diagnostics ?? '此记录暂无字段诊断，可点击解析缓存生成。'} /></div>
      </>}
      {tab === 'analysis' && (facts.length ? <dl className="divide-y divide-border">{facts.map((fact, index) => <div key={index} className="py-4 text-sm">
        <dt className="text-xs text-muted-foreground">{structure.data?.fields.find(field => field.key === fact.field)?.label ?? fields[fact.field] ?? fact.field} · {fact.section}</dt>
        <dd className="mt-2 font-medium">{rules.data?.find(r => r.id === fact.value)?.name ?? fact.value}</dd>
        <dd className="mt-2 border-l-2 border-border pl-3 leading-relaxed text-muted-foreground">{fact.evidence}</dd></div>)}</dl>
        : <p className="py-4 text-sm text-muted-foreground">{data.parseStatus === 'PENDING' ? '尚未采集解析。' : '暂无通过校验的字段，请查看原文或启用智能解析后重采。'}</p>)}
      {tab === 'raw' && <><p className="mb-4 break-all text-xs text-muted-foreground">正文来源：{data.frameUrl || '尚未采集'}</p>
        {data.capturedAt && <p className="mb-4 text-xs text-muted-foreground"><a className="text-primary underline" href={`/api/procurement/notices/${encodeURIComponent(id)}/cache`} download>下载页面缓存（HTML 与 iframe JSON）</a> · 旧采集记录可能仅有正文。</p>}
        <pre className="procurement-detail-text">{data.rawText || '暂无采集原文，请先执行采集。'}</pre></>}
      {tab === 'candidates' && <><p className="mb-4 text-sm text-muted-foreground">字面命中和数值仅是候选，尚未确认章节和业务对象。</p>
        <JsonEvidence value={JSON.parse(data.candidates)} /></>}
      {tab === 'source' && <JsonEvidence value={JSON.parse(data.sourceData)} />}
    </>}
  </WorkspaceDialog>
}

function JsonEvidence({ value }: { value: unknown }) {
  if (value === null || typeof value !== 'object') return <span className="whitespace-pre-wrap break-words text-sm">{String(value ?? '—')}</span>
  if (Array.isArray(value)) return <div className="grid gap-3">{value.map((item, index) => <div key={index}><JsonEvidence value={item} /></div>)}</div>
  return <dl className="grid gap-3">{Object.entries(value).map(([key, item]) => <div key={key} className="border-l border-border pl-3">
    <dt className="mb-1 text-xs text-muted-foreground">{key}</dt><dd><JsonEvidence value={item} /></dd></div>)}</dl>
}
