import { useState } from 'react'
import type { ChatItem } from '../../types'
import { abbr, cacheHitRate, fmtMs, parseUsage } from '../../lib/metrics'
import { copyTextToClipboard } from '../../lib/clipboard'
import { TurnChangesDialog } from '../changes/TurnChangesDialog'

/** 同一轮的指标、完整回复与变更入口，供历史轮次和当前 Dock 复用。 */
export function TurnResultDetails({ item, turnText, sessionId }: {
  item: Extract<ChatItem, { kind: 'result' }>; turnText?: string; sessionId?: string
}) {
  const [copied, setCopied] = useState(false)
  const [changesOpen, setChangesOpen] = useState(false)
  const usage = parseUsage(item.usage)
  const hit = cacheHitRate(item.usage)
  return <div className="space-y-2 text-xs text-[var(--color-muted-foreground)]">
    <p>结束原因：{item.stopReason}</p>
    {usage && <p>Token {abbr(usage.total)} · 输入 {abbr(usage.input)} · 输出 {abbr(usage.output)}{usage.cache > 0 ? ` · 缓存读 ${abbr(usage.cacheRead)} / 写 ${abbr(usage.cache - usage.cacheRead)}` : ''}</p>}
    {hit != null && <p>缓存命中率 {Math.floor(hit * 100)}%</p>}
    {item.latencyMs != null && <p>耗时 {fmtMs(item.latencyMs)}{item.ttftMs != null ? ` · 首字 ${fmtMs(item.ttftMs)}` : ''}</p>}
    {turnText && <button type="button" className="min-h-11 px-2 underline" onClick={async () => {
      await copyTextToClipboard(turnText); setCopied(true)
    }}>{copied ? '已复制' : '复制本轮'}</button>}
    {sessionId && item.turnId && <button type="button" className="min-h-11 px-2 underline" onClick={() => setChangesOpen(true)}>本轮变更</button>}
    {changesOpen && sessionId && item.turnId && <TurnChangesDialog sessionId={sessionId} turnId={item.turnId} open onOpenChange={setChangesOpen} />}
  </div>
}
