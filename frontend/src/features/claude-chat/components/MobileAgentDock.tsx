import type { ComponentProps } from 'react'
import { Button } from '@/components/ui/button'
import { MobileSessionStatus } from './MobileSessionStatus'
import { QueuedList } from './QueuedList'
import { SessionAutopilotStatus } from './SessionAutopilotStatus'
import { voiceAvailability } from '../lib/nativeVoice'

interface Props {
  status: ComponentProps<typeof MobileSessionStatus>
  queue: ComponentProps<typeof QueuedList>
  projectRoot: string
  onOpenDashboard: () => void
  voiceEnabled: boolean
  voiceDisabled: boolean
  onStartVoice: () => void
}

/** 会话控制的移动端呈现层；不持有第二份执行、队列或监督状态。 */
export function MobileAgentDock({ status, queue, projectRoot, onOpenDashboard, voiceEnabled, voiceDisabled, onStartVoice }: Props) {
  const voiceUnavailable = voiceEnabled ? voiceAvailability() : null
  return <MobileSessionStatus {...status} queueCount={queue.items.length} queuePausedReason={queue.pausedReason}>
    {close => <>
    <section aria-label="待发送队列">
      <h3 className="font-medium">待发送队列</h3>
      {queue.items.length === 0
        ? <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">暂无待发送消息</p>
        : <QueuedList {...queue} />}
    </section>
    <SessionAutopilotStatus sessionId={status.sessionId} projectRoot={projectRoot} onOpenDashboard={() => { close(); onOpenDashboard() }} />
    {voiceEnabled && <>
      <Button variant="outline" disabled={voiceDisabled || Boolean(voiceUnavailable)} onClick={() => { close(); onStartVoice() }}>语音对话</Button>
      {voiceUnavailable && <p className="text-xs text-[var(--color-muted-foreground)]">{voiceUnavailable}；仍可继续文字对话。</p>}
    </>}
    </>}
  </MobileSessionStatus>
}
