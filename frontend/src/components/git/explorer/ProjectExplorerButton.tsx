import { lazy, Suspense, useState, type ReactNode } from 'react'
import { FolderTree } from 'lucide-react'
import { Button } from '@/components/ui/button'

const ProjectExplorer = lazy(() => import('./ProjectExplorer'))
export function ProjectExplorerButton({ id, title, renderGitActions }: { id: string; title: string; renderGitActions?: (onBusyChange: (busy: boolean) => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  return <><Button variant="outline" size="sm" className="min-h-11 md:min-h-0" onClick={() => setOpen(true)} aria-label={`代码与 Git：${title}`}><FolderTree className="size-4" />代码与 Git</Button>
    {open && <Suspense fallback={<p role="status">正在加载项目浏览器…</p>}><ProjectExplorer title={title} endpoint={`/project-registry/${encodeURIComponent(id)}/review`} renderGitActions={renderGitActions} onClose={() => setOpen(false)} /></Suspense>}</>
}
