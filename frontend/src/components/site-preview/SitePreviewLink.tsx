import { lazy, Suspense, useMemo, useRef, useState } from 'react'
import { Globe } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseSitePreview } from '@/lib/sitePreview'

const SitePreviewDialog = lazy(() => import('./SitePreviewDialog').then(module => ({ default: module.SitePreviewDialog })))

/** Key the caller by its object context so changing sessions unmounts an open preview. */
export function SitePreviewLink({ declaration }: { declaration: string }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const parsed = useMemo(() => {
    try { return { target: parseSitePreview(declaration, window.location.origin) } }
    catch (error) { return { error: error instanceof Error ? error.message : '站点声明格式无效。' } }
  }, [declaration])
  if (!parsed.target) return <p role="alert" className="my-2 text-sm text-[var(--color-destructive)]">无法打开站点预览：{parsed.error}</p>
  const target = parsed.target
  return <div className="my-3 min-w-0">
    <Button ref={trigger} variant="outline" className="h-auto min-h-11 max-w-full justify-start py-2 text-left" onClick={() => setOpen(true)}>
      <Globe className="size-4 shrink-0" />
      <span className="min-w-0"><span className="block truncate">打开 {target.title}</span><span className="block truncate text-xs font-normal text-[var(--color-muted-foreground)]">{new URL(target.url).host} · 页内预览</span></span>
    </Button>
    {open && <Suspense fallback={<p role="status" className="mt-2 text-sm">正在打开站点预览…</p>}>
      <SitePreviewDialog key={target.url} target={target} onClose={() => setOpen(false)} returnFocus={() => trigger.current?.focus({ preventScroll: true })} />
    </Suspense>}
  </div>
}
