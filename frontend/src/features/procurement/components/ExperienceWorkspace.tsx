import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { procurementApi } from '../api'
import { dateText } from '../types'
import { WorkspaceState } from './WorkspaceState'

export function ExperienceWorkspace() {
  const [search, setSearch] = useState('')
  const client = useQueryClient()
  const catalog = useQuery({ queryKey: ['procurement', 'experiences'], queryFn: procurementApi.experiences })
  const history = useQuery({ queryKey: ['procurement', 'example-runs'], queryFn: procurementApi.exampleRuns })
  const run = useMutation({ mutationFn: procurementApi.regressExamples,
    onSuccess: () => client.invalidateQueries({ queryKey: ['procurement', 'example-runs'] }) })
  const rules = catalog.data?.rules.filter(rule => `${rule.id} ${rule.name} ${rule.description} ${rule.examples.map(e => e.text).join(' ')}`.toLowerCase().includes(search.toLowerCase())) ?? []
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3"><h1>解析经验</h1>
      <Button disabled={!catalog.data || run.isPending} onClick={() => run.mutate()}>{run.isPending ? '正在回归…' : '运行样例回归'}</Button></div>
    <p className="procurement-description">查看已落地的解析规则与正反例。样例回归使用当前字段配置和校验代码，不调用 Codex，不修改公告。</p>
    {run.error && <p role="alert" className="mb-4 text-sm text-destructive">{run.error.message}，可点击“运行样例回归”重试。</p>}
    <input className="procurement-input mb-5" aria-label="搜索解析经验" placeholder="搜索规则、编号或样例内容" value={search} onChange={e => setSearch(e.target.value)} />
    {catalog.isPending || catalog.isError ? <WorkspaceState error={catalog.error} retry={() => void catalog.refetch()} /> : <>
      <p className="mb-4 text-xs text-muted-foreground">{catalog.data.version} · 已登记 {catalog.data.rules.length} 条经验 · 正例表示应接受的行为，反例表示应阻止的行为</p>
      <div className="divide-y divide-border border-y border-border">{rules.map(rule => <details key={rule.id} className="py-4">
        <summary className="cursor-pointer text-sm font-medium">{rule.name}<span className="ml-3 text-xs font-normal text-muted-foreground">{rule.coverage}</span></summary>
        <p className="mt-3 text-sm leading-relaxed">{rule.description}</p>
        <p className="mt-2 text-xs text-muted-foreground">{rule.id} · 来源：{rule.source}</p>
        <div className="mt-4 grid gap-5 lg:grid-cols-2">{rule.examples.map(example => <section key={example.id} className="border-l-2 border-border pl-4">
          <h2 className="text-sm font-medium">{example.kind}</h2><pre className="my-2 whitespace-pre-wrap break-words font-sans text-sm">{example.text}</pre>
          {example.fact && <p className="text-xs text-muted-foreground">模型返回：{example.fact.field} = {example.fact.value}</p>}
          <p className="mt-2 text-sm">{example.explanation}</p>
        </section>)}</div>
        <p className="mt-4 break-words text-xs text-muted-foreground">实现与测试：{rule.implementation}</p>
      </details>)}</div>
      {!rules.length && <p className="py-6 text-sm">没有匹配经验。<Button variant="link" onClick={() => setSearch('')}>清除搜索</Button></p>}
    </>}
    <section className="mt-8"><h2>样例回归记录</h2><p className="mt-2 mb-4 text-sm text-muted-foreground">最近 20 次。通过表示结果符合样例预期，反例被正确拒绝也算通过；不代表真实公告的模型准确率。流程单测不在此执行。</p>
      {history.isPending || history.isError ? <WorkspaceState error={history.error} retry={() => void history.refetch()} />
        : history.data?.length ? <div className="divide-y divide-border">{history.data.map(item => <details key={item.id} className="py-4">
          <summary className="cursor-pointer text-sm">{dateText(item.createdAt)} · {item.passed}/{item.total} 符合预期 · {item.ruleVersion} · 字段 v{item.schemaVersion}</summary>
          <ul className="mt-3 space-y-3">{item.outcomes.map(outcome => <li key={outcome.exampleId} className="text-sm">
            <span className={outcome.passed ? '' : 'text-destructive'}>{outcome.passed ? '符合预期' : '与预期不符'} · {outcome.exampleId}</span>
            <p className="mt-1 text-xs text-muted-foreground">预期：{outcome.example.expected === 'ACCEPT' ? `接受 ${outcome.example.expectedValue}` : '拒绝'}；实际：{outcome.actual === 'ACCEPT' ? `接受 ${outcome.actualValue}` : '拒绝'}{outcome.review.rejected.map(r => `；${r.reason}`).join('')}</p>
          </li>)}</ul>
        </details>)}</div> : <p className="text-sm text-muted-foreground">尚无回归记录，点击“运行样例回归”生成首条记录。</p>}
    </section>
  </>
}
