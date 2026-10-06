import { useEffect, useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
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
  const [loaded, setLoaded] = useState(false)
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [initialPaths, setInitialPaths] = useState<string[] | null>(null)
  const [search, setSearch] = useState('')
  const workspaceQuery = useQuery({ queryKey: ['claude-chat-workspaces'], queryFn: listWorkspaces, staleTime: 30_000 })
  const { projects: visibleProjects, ready: projectsReady } = useVisibleWorkspaceProjects(workspaceQuery.data)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoaded(false)
    setError(null)
    listSessionProjectDirectories(sessionId).then(linkedPaths => {
      if (!active) return
      setInitialPaths(linkedPaths)
      setLoaded(true)
    }).catch(caught => active && setError(errorMessage(caught)))
    return () => { active = false }
  }, [sessionId, reload])

  const projects = useMemo(() => {
    const primaryKey = normalizeWorkspaceProjectPath(primaryCwd)
    return visibleProjects.filter(project => normalizeWorkspaceProjectPath(project.path) !== primaryKey)
  }, [primaryCwd, visibleProjects])

  useEffect(() => {
    if (!projectsReady || initialPaths == null) return
    setSelected(initialPaths)
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
    <Dialog.Root open onOpenChange={open => { if (!open && !saving) onClose() }}>
      <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/45" />
      <Dialog.Content aria-describedby="session-directory-description"
        onEscapeKeyDown={event => { if (saving) event.preventDefault() }}
        onPointerDownOutside={event => { if (saving) event.preventDefault() }}
        className="fixed left-1/2 top-1/2 z-[101] flex max-h-[85dvh] w-[calc(100%-1.5rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-[var(--color-card)] shadow-lg">
        <header className="flex items-start gap-3 border-b px-4 py-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-600"><FolderGit2 className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <Dialog.Title className="text-sm font-semibold">关联工作目录</Dialog.Title>
            <p id="session-directory-description" className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">选择可协同开发的项目，可在提交记录中切换查看；下一轮对话会带上这些目录。主工作目录保持不变。</p>
          </span>
          <Button variant="ghost" size="icon" className="size-8" aria-label="关闭关联目录" disabled={saving} onClick={onClose}><X className="size-4" /></Button>
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
          {!loaded || !projectsReady || initialPaths != null ? (
            <div className="grid min-h-40 place-items-center text-xs text-[var(--color-muted-foreground)]"><Loader2 className="mb-2 size-5 animate-spin" />正在加载项目…</div>
          ) : filtered.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {filtered.map(project => {
                const checked = selected.includes(project.path)
                return (
                  <button key={project.path} type="button" aria-pressed={checked} disabled={saving} onClick={() => toggle(project.path)}
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
          {(error || workspaceQuery.isError) && <p role="alert" className="mt-3 text-xs text-[var(--color-destructive)]">{error || '项目目录加载失败'}
            <button type="button" className="ml-3 underline" onClick={() => { setReload(value => value + 1); void workspaceQuery.refetch() }}>重试</button></p>}
          {selected.filter(path => !projects.some(project => normalizeWorkspaceProjectPath(project.path) === normalizeWorkspaceProjectPath(path))).map(path =>
            <div key={path} className="mt-2 flex items-center gap-2 text-xs"><span className="min-w-0 break-all">{path}（当前不可选）</span><button type="button" disabled={saving} className="shrink-0 underline" onClick={() => toggle(path)}>移除关联</button></div>)}
        </div>

        <footer className="flex items-center justify-between border-t px-4 py-3">
          <span className="text-xs text-[var(--color-muted-foreground)]">已选 {selected.length} / {MAX_PROJECT_COUNT}</span>
          <div className="flex gap-2"><Button variant="outline" disabled={saving} onClick={onClose}>取消</Button><Button onClick={save} disabled={saving || !loaded || !projectsReady || workspaceQuery.isError}>{saving && <Loader2 className="mr-1 size-4 animate-spin" />}保存关联</Button></div>
        </footer>
      </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '项目关联保存失败'
}
