import { useState } from 'react'
import type { ChatItem } from '../types'
import { abbr, fmtMs } from '../lib/metrics'
import { currentActivityElapsed, dockExecutionItems, turnTextAtResult } from '../lib/mobileExecutionPresentation'
import { ToolCallBubble } from './ToolCallBubble'
import { Button } from '@/components/ui/button'
import { TurnResultDetails } from './messages/TurnResultDetails'

/** 详情仅在 Dock 抽屉打开时挂载，保留事件及原始参数，不建立第二份执行状态。 */
export function MobileExecutionDetails({ items, running, turnTokens, sessionId }: { items: ChatItem[]; running: boolean; turnTokens: number; sessionId?: string }) {
  const [limit, setLimit] = useState(20)
  const events = dockExecutionItems(items, running)
  const result = events.filter((item): item is Extract<ChatItem, { kind: 'result' }> => item.kind === 'result').at(-1)
  const elapsed = running ? currentActivityElapsed(items) : null
  return <section aria-label="执行详情" className="border-t pt-3">
    <h3 className="font-medium">执行详情 · {running ? '当前执行' : '最近一轮'}</h3>
    {running && turnTokens > 0 && <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">当前轮输出 {abbr(turnTokens)} Token</p>}
    {running && typeof elapsed === 'number' && Number.isFinite(elapsed) && elapsed >= 0 && <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">当前活动耗时 {fmtMs(elapsed)}</p>}
    {result && <div className="mt-2"><TurnResultDetails item={result} sessionId={sessionId} turnText={turnTextAtResult(items, result.id)} /></div>}
    {!events.length && <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">暂无执行事件。更早记录可在轨迹中查看。</p>}
    {events.length > limit && <Button variant="ghost" className="mt-2 min-h-11 text-xs" onClick={() => setLimit(value => value + 20)}>显示更早执行事件（还有 {events.length - limit} 条）</Button>}
    <div className="mt-2 space-y-2">{events.slice(-limit).map(item => {
      if (item.kind === 'tool') return <ToolCallBubble key={item.id} toolName={item.toolName} input={item.input} output={item.output} isError={item.isError} />
      if (item.kind === 'activity') return <details key={item.id} className="border-b pb-2 text-xs">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3"><span className="min-w-0 break-words">{item.title}</span><span className="shrink-0 text-[var(--color-muted-foreground)]">{['completed', 'success'].includes(item.status) ? '已完成' : item.status === 'failed' || item.severity === 'error' ? '异常' : item.severity === 'warning' ? '需处理' : '进行中'}</span></summary>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words text-[var(--color-muted-foreground)]">{[item.detail, detailText(item.data)].filter(Boolean).join('\n')}</pre>
      </details>
      if (item.kind === 'error') return <p key={item.id} className="break-words text-xs text-[var(--color-destructive)]">{item.message}</p>
      return null
    })}</div>
  </section>
}

function detailText(value: unknown) {
  if (value == null) return ''
  try { return typeof value === 'string' ? value : JSON.stringify(value, null, 2) } catch { return '请在轨迹中查看此事件。' }
}
