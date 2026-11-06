import { lazy, Suspense, useState } from 'react'
import { FolderTree } from 'lucide-react'
import { Button } from '@/components/ui/button'

const ProjectExplorer = lazy(() => import('./ProjectExplorer'))
export function ProjectExplorerButton({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false)
  return <><Button variant="outline" size="sm" className="min-h-11 md:min-h-0" onClick={() => setOpen(true)} aria-label={`项目浏览器：${title}`}><FolderTree className="size-4" />代码审阅</Button>
    {open && <Suspense fallback={<p role="status">正在加载项目浏览器…</p>}><ProjectExplorer title={title} endpoint={`/project-registry/${encodeURIComponent(id)}/review`} onClose={() => setOpen(false)} /></Suspense>}</>
}
