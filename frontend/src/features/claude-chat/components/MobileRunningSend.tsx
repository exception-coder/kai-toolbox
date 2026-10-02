import { useRef } from 'react'
import { CornerUpRight, ListPlus, Send } from 'lucide-react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useMobileDisclosure } from '../hooks/useMobileDisclosure'

/** 移动端按需选择发送方式，沿用会话现有的排队和补充能力。 */
export function MobileRunningSend({ canSteer, disabled, onSteer, onEnqueue, onReturnFocus }: {
  canSteer: boolean
  disabled: boolean
  onSteer: () => void
  onEnqueue: () => void
  onReturnFocus?: () => void
}) {
  const [open, setOpen] = useMobileDisclosure()
  const trigger = useRef<HTMLButtonElement>(null)
  function send(action: () => void) {
    setOpen(false)
    action()
  }
  return <>
    <Button ref={trigger} type="button" size="icon" className="size-10 md:hidden"
      disabled={disabled} aria-label="选择发送方式，默认加入队列" onClick={() => setOpen(true)}>
      <Send className="size-4" />
    </Button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto rounded-t-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
        onCloseAutoFocus={event => {
          event.preventDefault()
          if (trigger.current?.disabled && onReturnFocus) onReturnFocus()
          else trigger.current?.focus()
        }}>
        <SheetTitle>发送方式</SheetTitle>
        <SheetDescription className="mt-1">当前作业继续执行。默认加入队列，本轮正常结束后按顺序发送；异常结束会暂停队列。</SheetDescription>
        <div className="mt-4 flex flex-col gap-2">
          <Button type="button" className="min-h-11 justify-start" disabled={disabled} onClick={() => send(onEnqueue)}>
            <ListPlus className="size-4" />加入队列（默认）
          </Button>
          {canSteer && <Button type="button" variant="outline" className="min-h-11 justify-start" disabled={disabled} onClick={() => send(onSteer)}>
            <CornerUpRight className="size-4" />补充到当前轮
          </Button>}
          <p className="text-xs text-[var(--color-muted-foreground)]">补充会影响正在进行的作业；独立任务请加入队列。</p>
        </div>
      </SheetContent>
    </Sheet>
  </>
}
