import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { useMobileViewport } from '../hooks/useMobileViewport'

/** 点击编辑标题；长按和键盘菜单键只打开原模式选择，不承担会话导航。 */
export function MobileWorkspaceSwitcher({ title, status, control, onOpen, onRename, triggerRef }: {
  title: string
  status: string
  control?: (close: () => void) => ReactNode
  onOpen?: () => void
  onRename: () => void
  triggerRef?: Ref<HTMLButtonElement>
}) {
  const [open, setOpen] = useState(false)
  const contentId = useId()
  const ownTriggerRef = useRef<HTMLButtonElement>(null)
  const press = useRef<{ id: number; x: number; y: number } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const consumeClick = useRef(false)
  const cancelPress = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
    press.current = null
  }, [])
  const attachTrigger = useCallback((node: HTMLButtonElement | null) => {
    ownTriggerRef.current = node
    if (typeof triggerRef === 'function') triggerRef(node)
    else if (triggerRef) triggerRef.current = node
  }, [triggerRef])
  const mobile = useMobileViewport()
  useEffect(() => { if (!mobile) { setOpen(false); cancelPress() } }, [mobile, cancelPress])
  useEffect(() => cancelPress, [cancelPress])
  const openModes = () => { consumeClick.current = true; setOpen(true); onOpen?.() }
  const close = () => setOpen(false)
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverAnchor asChild>
      <button ref={attachTrigger} type="button" aria-label={`重命名会话，${title}`} aria-haspopup="dialog" aria-expanded={open}
        aria-controls={open ? contentId : undefined} title="点击重命名；长按切换对话方式（键盘 Shift+F10）"
        onPointerDown={event => {
          if (event.button !== 0 || event.isPrimary === false || press.current) return
          consumeClick.current = false
          press.current = { id: event.pointerId, x: event.clientX, y: event.clientY }
          timer.current = setTimeout(() => { timer.current = null; openModes() }, 500)
        }}
        onPointerMove={event => {
          const start = press.current
          if (start && start.id === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) {
            consumeClick.current = true; cancelPress()
          }
        }}
        onPointerUp={cancelPress} onPointerCancel={() => { consumeClick.current = true; cancelPress() }}
        onPointerLeave={() => { if (press.current) { consumeClick.current = true; cancelPress() } }}
        onClick={event => { event.preventDefault(); if (consumeClick.current) { consumeClick.current = false; return }; onRename() }}
        onContextMenu={event => { event.preventDefault(); cancelPress(); openModes() }}
        onKeyDown={event => {
          if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) { event.preventDefault(); cancelPress(); openModes() }
          else if (event.key === 'Enter' || event.key === ' ') consumeClick.current = false
        }}
        style={{ WebkitTouchCallout: 'none' }}
        className="cc-mobile-session-navigation mx-auto flex min-h-11 min-w-0 max-w-full select-none items-center justify-center rounded-md px-2 text-sm font-semibold hover:bg-[var(--color-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
        <span className="truncate">{title}</span>
      </button>
    </PopoverAnchor>
    <PopoverContent id={contentId} align="center" sideOffset={8} className="w-80 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-80px)] overflow-y-auto rounded-xl bg-[var(--color-background)] p-2 shadow-sm" aria-label="对话方式"
      onCloseAutoFocus={event => { event.preventDefault(); ownTriggerRef.current?.focus({ preventScroll: true }) }}>
      <div className="px-3 pb-3 pt-2">
        <p className="break-words text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{status}</p>
      </div>
      {control && <section aria-label="当前模式"><p className="px-3 pb-1 text-xs text-[var(--color-muted-foreground)]">当前模式</p>{control(close)}</section>}
    </PopoverContent>
  </Popover>
}
