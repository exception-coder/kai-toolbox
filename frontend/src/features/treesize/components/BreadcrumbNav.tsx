import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BreadcrumbNavProps {
  rootPath: string
  currentPath: string | null
  onNavigate: (path: string | null) => void
}

export function BreadcrumbNav({ rootPath, currentPath, onNavigate }: BreadcrumbNavProps) {
  const segments = computeSegments(rootPath, currentPath)

  return (
    <nav className="flex items-center gap-1 overflow-x-auto rounded-md border bg-[var(--color-card)] px-3 py-2 text-sm">
      <button
        onClick={() => onNavigate(null)}
        className={cn(
          'flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[var(--color-accent)]',
          currentPath === null && 'font-medium text-[var(--color-foreground)]'
        )}
      >
        <Home className="h-3.5 w-3.5" />
        <span>{rootPath}</span>
      </button>
      {segments.map((seg, i) => (
        <span key={seg.path} className="flex items-center gap-1">
          <ChevronRight className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
          <button
            onClick={() => onNavigate(seg.path)}
            className={cn(
              'rounded px-1.5 py-0.5 hover:bg-[var(--color-accent)]',
              i === segments.length - 1 && 'font-medium text-[var(--color-foreground)]'
            )}
          >
            {seg.name}
          </button>
        </span>
      ))}
    </nav>
  )
}

function computeSegments(rootPath: string, currentPath: string | null): { name: string; path: string }[] {
  if (!currentPath || currentPath === rootPath) return []
  const sep = rootPath.includes('\\') ? '\\' : '/'
  if (!currentPath.startsWith(rootPath)) {
    return [{ name: currentPath, path: currentPath }]
  }
  const tail = currentPath.slice(rootPath.length).replace(/^[\\/]+/, '')
  if (!tail) return []
  const parts = tail.split(/[\\/]/).filter(Boolean)
  const segs: { name: string; path: string }[] = []
  let acc = rootPath
  for (const p of parts) {
    acc = acc.endsWith(sep) ? acc + p : acc + sep + p
    segs.push({ name: p, path: acc })
  }
  return segs
}
