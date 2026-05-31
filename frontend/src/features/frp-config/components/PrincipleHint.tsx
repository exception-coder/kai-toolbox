import { useState } from 'react'
import { Info, ChevronDown, ChevronRight } from 'lucide-react'
import { PRINCIPLES, type PrincipleKey } from '../lib/principles'

interface Props {
  k: PrincipleKey
  /** 默认是否展开。默认 false。 */
  defaultOpen?: boolean
}

/** 行内可折叠的「实际原理」气泡，hover info 图标即可看摘要，点开看详细。 */
export function PrincipleHint({ k, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const entry = PRINCIPLES[k]
  return (
    <div className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-muted)]/30 p-3 text-xs leading-relaxed">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-start gap-2 text-left"
      >
        {open ? (
          <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
        ) : (
          <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
        )}
        <Info className="mt-0.5 size-3.5 shrink-0 text-sky-500" />
        <div className="flex-1">
          <div className="font-medium text-[var(--color-foreground)]">{entry.title}</div>
          <div className="text-[var(--color-muted-foreground)]">{entry.oneLiner}</div>
        </div>
      </button>
      {open && (
        <div className="mt-2 space-y-1.5 border-t border-dashed border-[var(--color-border)] pt-2 pl-6 text-[var(--color-muted-foreground)]">
          {entry.detail.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}
    </div>
  )
}
