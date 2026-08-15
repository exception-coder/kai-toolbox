import { useState, type ReactNode } from 'react'
import { ChevronUp, SlidersHorizontal } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'

export function MobileSessionConfigSheet({
  summary,
  disabled,
  children,
}: {
  summary: string
  disabled?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="col-start-2 row-start-2 flex h-8 max-w-[11rem] min-w-0 items-center justify-self-end gap-1 rounded-lg px-2 text-xs font-medium text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] disabled:opacity-50 md:hidden"
        aria-label={`会话配置，当前 ${summary}`}
        title={`会话配置 · ${summary}`}
      >
        <SlidersHorizontal className="size-3.5 shrink-0 text-[var(--color-primary)]" />
        <span className="truncate">{summary}</span>
        <ChevronUp className="size-3.5 shrink-0 opacity-60" />
      </button>
      <SheetContent
        side="bottom"
        className="max-h-[80dvh] rounded-t-2xl p-0 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="border-b px-4 pb-3 pt-4">
          <SheetTitle>会话配置</SheetTitle>
          <SheetDescription className="mt-1">
            权限、服务商和模型参数按当前会话生效，模型相关配置从下一轮开始使用。
          </SheetDescription>
        </div>
        <div className="space-y-3 px-4 py-4">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}
