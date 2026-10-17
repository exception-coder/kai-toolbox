import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { DatabaseResourceBindings } from '@/features/ops/public-api'
import { ConsultDatabaseSelection } from '@/features/agent-management/public-api'
import { getConsultDatabaseConfiguration } from '../consultAttachmentPolicy'

/** 咨询上下文内组合原资源关联与流程编辑能力，不保存第二套数据库配置。 */
export function ConsultDatabaseSettings({ sourcePath }: { sourcePath?: string }) {
  const [bindingsOpened, setBindingsOpened] = useState(false)
  const [selectionOpened, setSelectionOpened] = useState(false)
  const databases = useQuery({ queryKey: ['consult-database-configuration'], queryFn: getConsultDatabaseConfiguration })
  const selected = databases.data?.selectedBindingIds ?? []
  const missing = selected.filter(id => !databases.data?.resources.some(resource => resource.bindingId === id))
  return <section aria-labelledby="consult-database-settings" className="space-y-3">
    <div className="flex items-center justify-between gap-3"><h3 id="consult-database-settings" className="font-semibold">咨询数据库</h3><Button variant="ghost" onClick={() => void databases.refetch()} disabled={databases.isFetching}>刷新</Button></div>
    <p className="text-xs leading-5 text-muted-foreground">支持多个数据库。先关联到咨询系统，再在流程中多选、保存候选并发布；评测可选。旧咨询保留资源选择快照；连接地址修改影响后续查询。</p>
    {databases.isPending && <p role="status">正在读取数据库配置…</p>}
    {databases.isError && <p role="alert" className="text-xs text-destructive">数据库配置读取失败，请刷新重试。</p>}
    {databases.isSuccess && <p className="text-xs">已发布流程 v{databases.data.workflowVersion ?? '默认'} · 选用 {selected.length} 个数据库绑定（按咨询系统隔离）</p>}
    {databases.isSuccess && !selected.length && <p className="text-xs">已发布流程尚未选择数据库，可在下方直接配置；登记连接不等于已关联或已发布。</p>}
    {missing.length > 0 && <p role="alert" className="break-all text-xs text-destructive">已发布流程包含失效绑定：{missing.join('、')}。请重新配置。</p>}
    <ul className="divide-y">{databases.data?.resources.map(resource => <li key={resource.bindingId} className="space-y-1 py-3 text-xs">
      <p className="font-medium">{resource.systemName} · {resource.name}</p>
      <p className="break-all font-mono">{resource.endpoint || '地址不可用'} · {resource.environment}</p>
      <p className="text-muted-foreground">{selected.includes(resource.bindingId) ? '已发布流程选用' : '未被已发布流程选用'} · {resource.state === 'AVAILABLE' ? '允许查询（未代表已测试连接）' : `不可查询：${resource.state}`}</p>
      <a className="inline-flex min-h-11 items-center underline underline-offset-4" href={resource.configurationUrl} target="_blank" rel="noreferrer">查看 / 修改此连接 ↗</a>
    </li>)}</ul>
    <details className="border-t" onToggle={event => { if (event.currentTarget.open) setBindingsOpened(true) }}><summary className="min-h-11 cursor-pointer py-3 text-xs font-medium">1. 管理系统关联与连接</summary>{bindingsOpened && <DatabaseResourceBindings sourcePath={sourcePath} />}</details>
    <details className="border-t" onToggle={event => { if (event.currentTarget.open) setSelectionOpened(true) }}><summary className="min-h-11 cursor-pointer py-3 text-xs font-medium">2. 多选咨询数据库与发布</summary>{selectionOpened && <ConsultDatabaseSelection />}</details>
  </section>
}
