import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowLeft, ArrowRight, X } from 'lucide-react'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { GUIDE_CHAPTERS, type GuideTarget } from './guideContent'

const TARGETS: Record<GuideTarget, string> = {
  start: '[data-guide-location="start"]', sessions: '[data-guide-location="sessions"]',
  execution: '[aria-label="会话视图"]', workspace: '#session-tools-menu',
  delivery: '#session-tools-menu', settings: '#session-tools-menu',
}
type Bounds = { left: number; top: number; width: number; height: number }
const control = 'min-h-11 rounded-md px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]'

export function SpotlightTour({ step, onStep, onLocate, onRestore, onClose, onReference, hasSession }: {
  step: number; onStep: (step: number) => void; onLocate: (target: GuideTarget) => void
  onRestore: () => void; onClose: () => void; onReference: () => void; hasSession: boolean
}) {
  const portal = useFullscreenPortalContainer()
  const card = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState<Bounds | null>(null)
  const [position, setPosition] = useState({ left: 16, top: 16 })
  const chapter = GUIDE_CHAPTERS[step]
  const topic = chapter.topics[0]
  useEffect(() => {
    onLocate(chapter.id)
  }, [chapter.id, onLocate])
  useEffect(() => onRestore, [onRestore])
  useLayoutEffect(() => {
    let frame = 0
    let disposed = false
    const measure = () => {
      const target = document.querySelector(TARGETS[chapter.id])
      const rect = target?.getBoundingClientRect()
      const width = window.innerWidth, height = window.innerHeight
      const visible = rect && rect.width > 0 && rect.height > 0
      const next = visible ? {
        left: Math.max(6, rect.left - 4), top: Math.max(6, rect.top - 4),
        width: Math.max(0, Math.min(width - 6, rect.right + 4) - Math.max(6, rect.left - 4)),
        height: Math.max(0, Math.min(height - 6, rect.bottom + 4) - Math.max(6, rect.top - 4)),
      } : null
      setBounds(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
      const cardHeight = card.current?.offsetHeight ?? 340
      const cardWidth = Math.min(440, width - 24)
      const left = width <= 640 ? 12 : next && next.left > cardWidth + 24
        ? next.left - cardWidth - 16 : Math.max(12, width - cardWidth - 24)
      const below = next && next.top + next.height + 16
      const top = width <= 640 ? Math.max(12, height - cardHeight - 12)
        : below && below + cardHeight < height - 12 ? below : Math.max(12, height - cardHeight - 24)
      setPosition(previous => previous.left === left && previous.top === top ? previous : { left, top })
    }
    const update = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(() => { if (!disposed) measure() }) }
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true })
    const resize = new ResizeObserver(update)
    if (card.current) resize.observe(card.current)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    measure(); update()
    return () => { disposed = true; cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [chapter.id])
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose() }}><Dialog.Portal container={portal}>
    <Dialog.Overlay className="fixed inset-0 z-[80] bg-transparent" />
    {bounds ? <div aria-hidden="true" className="vibe-tour-spotlight fixed z-[80] pointer-events-none" style={bounds} />
      : <div aria-hidden="true" className="fixed inset-0 z-[80] pointer-events-none bg-black/35" />}
    <Dialog.Content ref={card} onOpenAutoFocus={event => { event.preventDefault(); card.current?.focus() }}
      onPointerDownOutside={event => event.preventDefault()} onInteractOutside={event => event.preventDefault()}
      className="vibe-tour-card fixed z-[81] max-h-[calc(100dvh-24px)] w-[min(440px,calc(100vw-24px))] overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-5 text-[var(--color-foreground)] shadow-lg"
      style={position}>
      <div className="flex items-start gap-3"><div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-[var(--color-primary)]">{chapter.title}</p>
        <Dialog.Title className="mt-1 text-lg font-semibold">{topic.title}</Dialog.Title>
      </div><button aria-label="关闭导览" onClick={onClose} className={`${control} -mr-2 -mt-2`}><X className="size-4" /></button></div>
      <Dialog.Description className="mt-3 text-sm leading-relaxed">{topic.purpose}</Dialog.Description>
      <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted-foreground)]">什么时候用：{topic.when}</p>
      <p className="mt-2 text-xs leading-relaxed">入口：{topic.path}</p>
      {(!bounds || (!hasSession && chapter.id === 'execution')) && <p role="status" className="mt-2 text-xs text-[var(--color-muted-foreground)]">{!hasSession && chapter.id === 'execution' ? '先新建或选择会话，即可使用这些执行视图。' : '当前布局没有显示此入口，可继续下一步或查看完整指南。'}</p>}
      <div aria-label={`导览进度 ${step + 1}/${GUIDE_CHAPTERS.length}`} className="mt-5 flex gap-1">{GUIDE_CHAPTERS.map((item, index) => <span key={item.id} className={`h-1 flex-1 ${index <= step ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-muted)]'}`} />)}</div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-1"><span className="text-xs tabular-nums text-[var(--color-muted-foreground)]">{step + 1} / {GUIDE_CHAPTERS.length}</span>
        <button className={control} onClick={onClose}>暂不查看</button>
        <div className="flex items-center gap-1"><button className={`${control} disabled:opacity-40`} disabled={step === 0} onClick={() => onStep(step - 1)} aria-label="上一步"><ArrowLeft className="size-4" /></button>
          <button className={`${control} flex items-center gap-1 bg-[var(--color-primary)] text-[var(--color-primary-foreground)]`} onClick={() => step === GUIDE_CHAPTERS.length - 1 ? onClose() : onStep(step + 1)}>{step === GUIDE_CHAPTERS.length - 1 ? '完成' : '下一步'}<ArrowRight className="size-4" /></button></div>
      </div>
      <button className="mt-1 min-h-11 text-xs text-[var(--color-muted-foreground)] underline underline-offset-4" onClick={onReference}>完整功能指南</button>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
