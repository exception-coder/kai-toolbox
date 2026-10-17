import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { MobileSessionStatus } from './MobileSessionStatus'
import { QueuedList } from './QueuedList'
import { voiceAvailability } from '../lib/nativeVoice'
import { MobileExecutionDetails } from './MobileExecutionDetails'

interface Props {
  status: ComponentProps<typeof MobileSessionStatus>
  queue: ComponentProps<typeof QueuedList>
  voiceEnabled: boolean
  voiceDisabled: boolean
  onStartVoice: () => void
  storage?: ReactNode
  diagnostics?: ReactNode
}

/** 主工作区共用的执行摘要与详情；不持有第二份执行、队列或监督状态。 */
export function MobileAgentDock({ status, queue, voiceEnabled, voiceDisabled, onStartVoice, storage, diagnostics }: Props) {
  const voiceUnavailable = voiceEnabled ? voiceAvailability() : null
  return <MobileSessionStatus {...status} queueCount={queue.items.length} queuePausedReason={queue.pausedReason}
    queueContent={<section aria-label="待发送队列">
      <h3 className="font-medium">待发送队列 <span className="ml-1 text-xs tabular-nums text-[var(--color-muted-foreground)]">{queue.items.length} 条</span></h3>
      {queue.items.length === 0
        ? <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">暂无待发送消息</p>
        : <QueuedList {...queue} className="border-0 px-0 pb-0" />}
    </section>}
    actions={close => <>
      {voiceEnabled && <>
        <Button variant="outline" disabled={voiceDisabled || Boolean(voiceUnavailable)} onClick={() => { close(); onStartVoice() }}>语音对话</Button>
        {voiceUnavailable && <p className="text-xs text-[var(--color-muted-foreground)]">{voiceUnavailable}；仍可继续文字对话。</p>}
      </>}
      {storage && <section aria-label="会话记录"><h3 className="mb-2 font-medium">会话记录</h3>{storage}</section>}
    </>}>
    {(_close, executing) => <>
      <MobileExecutionDetails items={status.items} running={executing} turnTokens={status.running ? status.turnTokens : 0} sessionId={status.sessionId} />
      {diagnostics && <section aria-label="状态与诊断" className="border-t pt-3"><h3 className="mb-2 font-medium">状态与诊断</h3>{diagnostics}</section>}
    </>}
  </MobileSessionStatus>
}
