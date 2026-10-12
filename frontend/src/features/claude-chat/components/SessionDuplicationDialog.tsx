import * as Dialog from '@radix-ui/react-dialog'
import { Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import type { SessionDuplicationOperation } from '../hooks/useClaudeChatSocket'

interface Props {
  operation: SessionDuplicationOperation | null
  onClose: () => void
  onReturnFocus: () => void
}

/** 复制反馈独立于会话列表，列表关闭或进入全屏后仍保持可见。 */
export function SessionDuplicationDialog({ operation, onClose, onReturnFocus }: Props) {
  const portalContainer = useFullscreenPortalContainer()
  const pending = operation?.phase === 'pending'
  const success = operation?.phase === 'success'
  const authSwitch = operation?.authSwitch
  const title = pending ? (authSwitch ? '正在切换授权会话' : '正在复制会话配置')
    : success ? (authSwitch ? '授权会话已就绪' : '会话副本已创建')
      : operation?.phase === 'unknown' ? '复制结果尚未确认' : '复制会话失败'

  return (
    <Dialog.Root open={operation != null} onOpenChange={open => { if (!open && !pending) onClose() }}>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/40" />
        <Dialog.Content
          className="appearance-elevated-chrome fixed left-1/2 top-1/2 z-[90] max-h-[85dvh] w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border p-5 text-[var(--color-popover-foreground)] shadow-lg focus:outline-none"
          onEscapeKeyDown={event => { if (pending) event.preventDefault() }}
          onInteractOutside={event => event.preventDefault()}
          onCloseAutoFocus={event => { event.preventDefault(); onReturnFocus() }}
        >
          <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
            {pending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
            {success && <Check aria-hidden="true" className="size-4" />}
            {title}
          </Dialog.Title>
          <Dialog.Description aria-live="polite" className="mt-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]">
            {pending ? (authSwitch ? '正在准备目标授权目录的会话，请稍候。'
              : '保留源会话，复制工作目录、引擎、服务商和分组。历史消息和待发送队列不复制。')
              : success ? (authSwitch ? '已切换到目标会话。' : '已切换到副本，可以开始独立对话。历史消息和待发送队列未复制。')
                : operation?.message}
          </Dialog.Description>
          <div className="mt-4 border-t pt-3 text-xs text-[var(--color-muted-foreground)]" aria-live="polite">
            {success ? '目标会话' : '源会话'}
            <span className="ml-2 break-all font-mono">{success ? operation?.targetSessionId : operation?.sourceSessionId}</span>
          </div>
          <div className="mt-5 flex justify-end">
            <Button className="min-h-11" disabled={pending} onClick={onClose}>
              {pending ? '请稍候…' : success ? '开始对话' : '我知道了'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
