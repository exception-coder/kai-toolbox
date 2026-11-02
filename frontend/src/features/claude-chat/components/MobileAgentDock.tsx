import { useId, useState, type ComponentProps, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronDown, Clock, Mic } from 'lucide-react'
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
  const voiceReason = voiceUnavailable ?? (voiceDisabled ? '当前会话未连接或已锁定' : null)
  return <MobileSessionStatus {...status} queueCount={queue.items.length} queuePausedReason={queue.pausedReason}
    storage={storage}
    actionHint={voiceEnabled && voiceReason ? `${voiceReason}；仍可继续文字对话。` : undefined}
    queueContent={<QueueDisclosure queue={queue} />}
    actions={close => <>
      {voiceEnabled && <Button variant="ghost" title={voiceReason ?? undefined} disabled={Boolean(voiceReason)} className="h-16 flex-col gap-1 text-xs" onClick={() => { close(); onStartVoice() }}><Mic aria-hidden="true" className="size-4" />语音对话</Button>}
    </>}>
    {(_close, executing) => <>
      <MobileExecutionDetails items={status.items} running={executing} turnTokens={status.running ? status.turnTokens : 0} sessionId={status.sessionId} />
      {diagnostics && <section aria-label="状态与诊断" className="border-t pt-3"><h3 className="mb-2 font-medium">状态与诊断</h3>{diagnostics}</section>}
    </>}
  </MobileSessionStatus>
}

function QueueDisclosure({ queue }: { queue: Props['queue'] }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const pending = queue.items.filter(item => !item.deliveryState).length
  const failed = queue.items.filter(item => item.deliveryState === 'FAILED').length
  const sending = queue.items.filter(item => item.deliveryState === 'DISPATCHING').length
  const accepted = queue.items.filter(item => item.deliveryState === 'ACCEPTED').length
  const checking = queue.items.length - pending - failed - sending - accepted
  const hasDelivery = queue.items.some(item => item.deliveryState)
  const deliverySummary = [[pending, '待发送'], [sending, '发送中'], [accepted, '执行中'], [failed, '失败'], [checking, '待核对']]
    .filter(([count]) => Number(count) > 0).map(([count, label]) => `${label} ${count}`).join(' · ')
  return <section className="border-b" aria-label="待发送队列">
    <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)} className="flex min-h-16 w-full items-center gap-2 py-2 text-left">
      <Clock aria-hidden="true" className="size-4 shrink-0 text-[var(--color-primary)]" />
      <span className="min-w-0 flex-1 wrap-anywhere"><span className="block font-medium">{hasDelivery ? '队列消息' : '待发送消息'} · {queue.items.length} 条</span>
        <span className="block text-xs text-[var(--color-muted-foreground)]">{queue.pausedReason ?? (hasDelivery ? deliverySummary : queue.items.length ? '当前轮正常结束后按序自动发送' : '暂无待发送消息')}</span>
      </span><ChevronDown aria-hidden="true" className={`size-4 shrink-0 ${open ? 'rotate-180' : ''}`} />
    </button>
    <div id={id}>{open && <QueuedList {...queue} compact className="border-0 px-0 pb-2" />}</div>
  </section>
}
