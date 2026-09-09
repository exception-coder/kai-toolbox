import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { formatMs, type StartupSnapshot } from '../model'

export function StartupSteps({ snapshot }: { snapshot: StartupSnapshot }) {
  const [filter, setFilter] = useState('')
  const steps = snapshot.slowestSteps.filter(step =>
    `${step.name} ${step.tags.beanName ?? ''} ${step.tags.beanType ?? ''}`.toLowerCase().includes(filter.toLowerCase()))
  return <section aria-labelledby="startup-steps-title">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h2 id="startup-steps-title" className="font-medium">最慢初始化步骤</h2>
        <p className="mt-1 text-xs leading-6 text-muted-foreground">保留 {snapshot.capturedStepCount} / {snapshot.stepCapacity} 个步骤，展示最慢 100 项。耗时包含子步骤。</p></div>
      <Input aria-label="筛选初始化步骤" placeholder="搜索 Bean 或步骤名称" value={filter}
        onChange={event => setFilter(event.target.value)} className="w-full sm:w-64" />
    </div>
    {snapshot.stepsPossiblyTruncated && <p role="status" className="mt-3 text-sm text-muted-foreground">采集容量已达到上限，后续步骤可能缺失。</p>}
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-y border-border text-xs text-muted-foreground"><tr>
          <th className="py-3 pr-4 font-normal">步骤 / Bean</th><th className="hidden px-3 font-normal sm:table-cell">父步骤</th>
          <th className="hidden px-3 text-right font-normal sm:table-cell">开始偏移</th><th className="pl-3 text-right font-normal">耗时</th>
        </tr></thead>
        <tbody className="divide-y divide-border">{steps.map(step => <tr key={step.id}>
          <td className="min-w-48 py-3 pr-4"><p className="break-all">{step.tags.beanName ?? step.name}</p>
            <p className="mt-1 break-all text-xs text-muted-foreground">#{step.id} · {step.name}</p></td>
          <td className="hidden px-3 font-mono text-xs sm:table-cell">{step.parentId ?? '—'}</td>
          <td className="hidden whitespace-nowrap px-3 text-right font-mono text-xs sm:table-cell">{formatMs(step.startOffsetMs)}</td>
          <td className="whitespace-nowrap pl-3 text-right font-mono tabular-nums">{formatMs(step.durationMs)}</td>
        </tr>)}</tbody>
      </table>
      {steps.length === 0 && <p className="py-6 text-sm text-muted-foreground">{filter ? '没有匹配步骤，清空搜索可查看全部记录。' : '尚无已完成步骤，请稍后刷新。'}</p>}
    </div>
  </section>
}
