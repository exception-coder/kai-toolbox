import { Share2 } from 'lucide-react'

export function SessionSharedBadge({ shared }: { shared?: boolean }) {
  if (!shared) return null
  return <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]">
    <Share2 aria-hidden="true" className="size-3" />已共享
  </span>
}
