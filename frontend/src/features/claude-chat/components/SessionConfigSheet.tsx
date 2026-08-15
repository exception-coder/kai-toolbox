import { useState, type ReactNode } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
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
  children: ReactNode
}

/** 移动端与桌面端共用的会话级配置入口。 */
export function SessionConfigSheet({
  summary,
  compactSummary,
  disabled,
  children,
}: SessionConfigSheetProps) {
  const [open, setOpen] = useState(false)
  const visibleSummary = compactSummary?.trim() || summary

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="col-start-2 row-start-2 flex h-8 max-w-32 min-w-0 items-center justify-self-end gap-1 rounded-lg px-1.5 text-xs font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] disabled:opacity-50 md:max-w-56 md:border md:bg-[var(--color-card)] md:px-2.5"
          aria-label={`会话配置，当前 ${summary}`}
          title={`会话配置 · ${summary}`}
        >
          <SlidersHorizontal className="hidden size-3.5 shrink-0 text-[var(--color-primary)] md:block" />
          <span className="min-w-0 flex-1 truncate md:hidden">{visibleSummary}</span>
          <span className="hidden min-w-0 flex-1 truncate md:inline">会话配置 · {visibleSummary}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[80dvh] rounded-t-2xl bg-[var(--color-background)] p-0 pb-[env(safe-area-inset-bottom)] md:inset-x-auto md:bottom-4 md:left-1/2 md:w-[min(28rem,calc(100vw-2rem))] md:-translate-x-1/2 md:rounded-2xl md:border"
      >
        <div className="border-b px-4 pb-3 pt-4">
          <SheetTitle>会话配置</SheetTitle>
          <SheetDescription className="mt-1">
            权限、模型参数和服务商按当前会话生效，模型相关配置从下一轮开始使用。
          </SheetDescription>
        </div>
        <div className="space-y-3 px-4 py-4">
          {children}
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
    terra: 'Terra',
  }
  const compactVariant = variant
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .map(part => knownVariants[part.toLowerCase()] ?? part)
    .join(' ')
  return `${version} ${compactVariant}`
}
