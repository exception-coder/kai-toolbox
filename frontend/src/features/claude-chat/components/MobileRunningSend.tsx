import { useEffect, useRef } from 'react'
import { ChevronDown, CornerUpRight, ListPlus, Send } from 'lucide-react'
import * as Popover from '@radix-ui/react-popover'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useMobileDisclosure } from '../hooks/useMobileDisclosure'

/** 桌面优先插入当前轮并保留排队选择，手机按需选择；沿用现有发送能力。 */
export function MobileRunningSend({ canSteer, disabled, onSteer, onEnqueue, onReturnFocus, desktop = false }: {
  canSteer: boolean
  disabled: boolean
  onSteer: () => void
  onEnqueue: () => void
  onReturnFocus?: () => void
  desktop?: boolean
}) {
  const [open, setOpen] = useMobileDisclosure(!desktop)
  const trigger = useRef<HTMLButtonElement>(null)
  const portal = useFullscreenPortalContainer()
  useEffect(() => setOpen(false), [desktop, setOpen])
  function send(action: () => void) {
    setOpen(false)
    action()
    onReturnFocus?.()
  }
  if (desktop) return <Popover.Root open={open} onOpenChange={setOpen}>
    <div className="flex shrink-0 items-center" aria-label="运行中发送">
      <Button type="button" size="sm" className="h-9 gap-1.5 rounded-r-none px-2.5" disabled={disabled}
        aria-label={canSteer ? '插入当前轮' : '加入队列'} title={canSteer ? 'Enter 插入当前轮；Ctrl/Cmd + Enter 加入队列' : 'Enter 加入队列，本轮正常结束后按顺序发送'} onClick={() => send(canSteer ? onSteer : onEnqueue)}>
        {canSteer ? <CornerUpRight className="size-4" /> : <ListPlus className="size-4" />}{canSteer ? '插入' : '排队'}
      </Button>
      <Popover.Trigger asChild><Button ref={trigger} type="button" className="h-9 w-6 rounded-l-none border-l border-[var(--color-primary-foreground)]/25 px-0"
        disabled={disabled} aria-label={canSteer ? '选择发送方式，默认插入当前轮' : '选择发送方式，默认加入队列'}><ChevronDown className="size-3.5" /></Button></Popover.Trigger>
    </div>
    <Popover.Portal container={portal}><Popover.Content side="top" align="end" sideOffset={8}
      onCloseAutoFocus={event => { event.preventDefault(); if (trigger.current?.disabled && onReturnFocus) onReturnFocus(); else trigger.current?.focus() }}
      className="z-[70] w-72 max-w-[calc(100vw-2rem)] rounded-lg border bg-[var(--color-popover)] p-2 text-[var(--color-popover-foreground)] shadow-md">
      <h3 className="px-2 py-2 text-xs font-medium">发送方式</h3>
      <Button type="button" variant="ghost" className="min-h-10 w-full justify-start text-xs" disabled={disabled} onClick={() => send(onEnqueue)}><ListPlus className="size-4" />加入队列 <kbd className="ml-auto text-[10px]">Ctrl/⌘ Enter</kbd></Button>
      {canSteer && <Button type="button" variant="ghost" className="min-h-10 w-full justify-start text-xs" disabled={disabled} onClick={() => send(onSteer)}><CornerUpRight className="size-4" />插入当前轮（默认）<kbd className="ml-auto text-[10px]">Enter</kbd></Button>}
      <p className="px-2 py-2 text-xs leading-relaxed text-[var(--color-muted-foreground)]">{canSteer ? '插入会影响当前作业；独立任务可加入队列，本轮正常结束后发送。' : '本轮正常结束后按顺序发送；异常结束会暂停队列。'}</p>
    </Popover.Content></Popover.Portal>
  </Popover.Root>
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
            <CornerUpRight className="size-4" />插入当前轮
          </Button>}
          <p className="text-xs text-[var(--color-muted-foreground)]">插入会影响正在进行的作业；独立任务请加入队列。</p>
        </div>
      </SheetContent>
    </Sheet>
  </>
}
