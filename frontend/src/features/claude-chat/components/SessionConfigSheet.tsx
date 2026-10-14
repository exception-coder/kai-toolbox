import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { useMobileViewport } from '../hooks/useMobileViewport'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

interface SessionConfigSheetProps {
  summary: string
  compactSummary?: string
  disabled?: boolean
  quickSelection?: (onCustom: () => void) => ReactNode
  children: ReactNode
  triggerContainer?: HTMLElement | null
  onOpen?: () => void
  onReturnFocus?: () => void
}

/** 移动端与桌面端共用的会话级配置入口。 */
export function SessionConfigSheet({
  summary,
  compactSummary,
  disabled,
  quickSelection,
  children,
  triggerContainer,
  onOpen,
  onReturnFocus,
}: SessionConfigSheetProps) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState(false)
  const mobile = useMobileViewport()
  const quick = mobile && quickSelection && !custom
  const visibleSummary = compactSummary?.trim() || summary
  const menuTrigger = triggerContainer !== undefined
  const trigger = <SheetTrigger asChild>
    <button type="button" disabled={disabled}
      className={menuTrigger
        ? 'flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-sm hover:bg-[var(--color-accent)] disabled:opacity-50'
        : 'col-start-2 row-start-2 flex h-8 max-w-32 min-w-0 items-center justify-self-end gap-1 rounded-lg px-1.5 text-xs font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] disabled:opacity-50 md:max-w-56 md:border md:bg-[var(--color-card)] md:px-2.5'}
      aria-label={`会话配置，当前 ${summary}`} title={`会话配置 · ${summary}`}>
      {menuTrigger && <span className="shrink-0">模型与配置</span>}
      <span className="min-w-0 flex-1 truncate">{visibleSummary}</span>
      <ChevronDown className="size-3.5 shrink-0 opacity-60" />
    </button>
  </SheetTrigger>

  return (
    <Sheet open={open} onOpenChange={value => { setOpen(value); if (value) { setCustom(false); onOpen?.() } }}>
      {menuTrigger ? triggerContainer && createPortal(trigger, triggerContainer) : trigger}
      <SheetContent
        side="bottom"
        onCloseAutoFocus={onReturnFocus ? event => { event.preventDefault(); onReturnFocus() } : undefined}
        className="max-h-[80dvh] overflow-y-auto rounded-t-xl bg-[var(--color-background)] p-0 pb-[env(safe-area-inset-bottom)] md:inset-x-auto md:bottom-4 md:left-1/2 md:w-[min(28rem,calc(100vw-2rem))] md:-translate-x-1/2 md:overflow-visible md:rounded-xl md:border"
      >
        <div className="border-b px-4 pb-3 pt-4">
          <SheetTitle>{quick ? 'Codex 模型选择' : '会话配置'}</SheetTitle>
          <SheetDescription className="mt-1">
            {quick ? '快捷组合和自定义均按当前会话生效。' : '权限、模型参数和服务商按当前会话生效，模型相关配置从下一轮开始使用。'}
          </SheetDescription>
        </div>
        <div className="space-y-3 px-4 py-4">
          {quick ? quickSelection(() => setCustom(true)) : <>
            {mobile && quickSelection && <button type="button" className="min-h-11 text-xs text-[var(--color-muted-foreground)] underline" onClick={() => setCustom(false)}>返回快捷组合</button>}
            {children}
          </>}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function compactSessionModelLabel(label: string): string {
  const normalized = label.trim().replace(/\s+/g, ' ')
  const gptMatch = /^GPT[-\s]?(\d+(?:\.\d+)*)(?:[-\s]+(.+))?$/i.exec(normalized)
  if (!gptMatch) return normalized

  const [, version, variant] = gptMatch
  if (!variant) return version

  const knownVariants: Record<string, string> = {
    codex: 'Codex',
    luna: 'Luna',
    sol: 'Sol',
    astra: 'Astra',
    terra: 'Terra',
  }
  const compactVariant = variant
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .map(part => knownVariants[part.toLowerCase()] ?? part)
    .join(' ')
  return `${version} ${compactVariant}`
}
