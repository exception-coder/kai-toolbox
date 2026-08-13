import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, FolderGit2, Loader2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  normalizeWorkspaceProjectPath,
  useVisibleWorkspaceProjects,
} from '@/features/_devkit/public-api'
import { listSessionProjectDirectories, listWorkspaces, replaceSessionProjectDirectories } from '../api'

interface Props {
  sessionId: string
  primaryCwd: string
  onChanged: (paths: string[]) => void
  onClose: () => void
}

const MAX_PROJECT_COUNT = 8

/** 选择当前开发会话除主 cwd 外还需要协同核对的项目目录。 */
export function SessionProjectDirectoriesDialog({ sessionId, primaryCwd, onChanged, onClose }: Props) {
  const [selected, setSelected] = useState<string[]>([])
  const [initialPaths, setInitialPaths] = useState<string[] | null>(null)
  const [search, setSearch] = useState('')
  const workspaceQuery = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, staleTime: 30_000 })
  const { projects: visibleProjects, ready: projectsReady } = useVisibleWorkspaceProjects(workspaceQuery.data)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    listSessionProjectDirectories(sessionId).then(linkedPaths => {
      if (!active) return
      setInitialPaths(linkedPaths)
    }).catch(caught => active && setError(errorMessage(caught)))
    return () => { active = false }
  }, [sessionId])

  const projects = useMemo(() => {
    const primaryKey = normalizeWorkspaceProjectPath(primaryCwd)
    return visibleProjects.filter(project => normalizeWorkspaceProjectPath(project.path) !== primaryKey)
  }, [primaryCwd, visibleProjects])

  useEffect(() => {
    if (!projectsReady || initialPaths == null) return
    const visible = new Set(projects.map(project => normalizeWorkspaceProjectPath(project.path)))
    setSelected(initialPaths.filter(path => visible.has(normalizeWorkspaceProjectPath(path))))
    setInitialPaths(null)
  }, [initialPaths, projects, projectsReady])

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return projects
    return projects.filter(project => `${project.label} ${project.path}`
      .toLowerCase().includes(query))
  }, [projects, search])

  function toggle(path: string) {
    setError(null)
    setSelected(current => {
      if (current.includes(path)) return current.filter(candidate => candidate !== path)
      if (current.length >= MAX_PROJECT_COUNT) {
        setError(`每个会话最多关联 ${MAX_PROJECT_COUNT} 个附加项目`)
        return current
      }
      return [...current, path]
    })
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      await replaceSessionProjectDirectories(sessionId, selected)
      onChanged(selected)
      onClose()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-3" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-[var(--color-card)] shadow-2xl">
        <header className="flex items-start gap-3 border-b px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-600"><FolderGit2 className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">关联附加项目</h2>
            <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">主项目继续作为默认工作目录；所选目录会在下一轮作为会话级跨项目上下文注入所有代码引擎。</p>
          </span>
          <Button variant="ghost" size="icon" className="size-8" onClick={onClose}><X className="size-4" /></Button>
        </header>

        <div className="border-b px-4 py-3">
          <div className="rounded-lg border bg-[var(--color-muted)]/40 px-3 py-2 text-xs">
            <span className="text-[var(--color-muted-foreground)]">主项目：</span>
            <span className="ml-1 break-all font-mono">{primaryCwd}</span>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
            <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索项目名称或目录" className="pl-9" />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {!projectsReady || initialPaths != null ? (
            <div className="grid min-h-40 place-items-center text-xs text-[var(--color-muted-foreground)]"><Loader2 className="mb-2 size-5 animate-spin" />正在加载项目…</div>
          ) : filtered.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {filtered.map(project => {
                const checked = selected.includes(project.path)
                return (
                  <button key={project.path} type="button" onClick={() => toggle(project.path)}
                    className={`flex min-w-0 items-center gap-2 rounded-lg border p-3 text-left ${checked ? 'border-blue-500 bg-blue-500/10' : 'hover:bg-[var(--color-muted)]'}`}>
                    <span className={`grid size-8 shrink-0 place-items-center rounded-md ${checked ? 'bg-blue-600 text-white' : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'}`}>
                      {checked ? <Check className="size-4" /> : <FolderGit2 className="size-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium">{project.label}</span>
                      <span className="block truncate text-[10px] text-[var(--color-muted-foreground)]" title={project.path}>{project.path}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="grid min-h-40 place-items-center rounded-lg border border-dashed text-xs text-[var(--color-muted-foreground)]">{projects.length ? '没有匹配项目' : '没有其他可用项目；项目工作台中隐藏的项目不会显示'}</div>
          )}
          {error && <p className="mt-3 text-xs text-[var(--color-destructive)]">{error}</p>}
        </div>

        <footer className="flex items-center justify-between border-t px-4 py-3">
          <span className="text-xs text-[var(--color-muted-foreground)]">已选 {selected.length} / {MAX_PROJECT_COUNT}</span>
          <div className="flex gap-2"><Button variant="outline" onClick={onClose}>取消</Button><Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-1 size-4 animate-spin" />}保存关联</Button></div>
        </footer>
      </section>
    </div>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '项目关联保存失败'
}
