import { useState } from 'react'
import { FolderTree, Link2, Loader2, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  addTaskspaceMembers,
  createTaskspace,
  getTaskspaceInfo,
  listTaskspaceSubdirs,
  removeTaskspaceLinks,
  teardownTaskspace,
} from '../api'
import type { TaskspaceDir, TaskspaceView } from '../types'

interface Props {
  /** 工作区创建成功后回调，参数为新目录绝对路径（用于设为新会话 cwd）。 */
  onCreated: (dir: string) => void
  /** 关闭面板。 */
  onClose: () => void
  /** 进入「管理」tab 时预填的工作区目录。 */
  initialManageDir?: string
}

type Tab = 'create' | 'manage'

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * 「合并工作区」面板：父目录 → 列子目录 → 多选 → 命名 → 在新目录下建软链接聚合；
 * 以及对已有工作区的查看 / 追加 / 移除 / 拆除全生命周期管理。
 */
export function TaskspacePanel({ onCreated, onClose, initialManageDir }: Props) {
  const confirm = useConfirm()
  const [tab, setTab] = useState<Tab>(initialManageDir ? 'manage' : 'create')

  // ── 新建 tab ──
  const [parent, setParent] = useState('')
  const [base, setBase] = useState('')
  const [name, setName] = useState('')
  const [subdirs, setSubdirs] = useState<TaskspaceDir[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState('')

  const loadSubdirs = async () => {
    const p = parent.trim()
    if (!p) { setCreateMsg('请先填父目录'); return }
    setLoading(true); setCreateMsg(''); setSubdirs(null); setSelected(new Set())
    try {
      const res = await listTaskspaceSubdirs(p)
      if (!res.exists) { setCreateMsg(`父目录不存在或不可读: ${res.parent}`); return }
      setSubdirs(res.dirs)
      setBase(b => b.trim() || res.parent) // base 默认=父目录，可改
      if (!res.dirs.length) setCreateMsg('该目录下没有子目录')
    } catch (e) {
      setCreateMsg(errText(e))
    } finally {
      setLoading(false)
    }
  }

  const toggle = (path: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path); else next.add(path)
      return next
    })
  }

  const doCreate = async () => {
    if (!selected.size) { setCreateMsg('至少勾选一个目录'); return }
    if (!name.trim()) { setCreateMsg('请填工作区名称'); return }
    setCreating(true); setCreateMsg('')
    try {
      const view = await createTaskspace(base.trim() || parent.trim(), name.trim(), [...selected])
      onCreated(view.dir)
    } catch (e) {
      setCreateMsg(errText(e))
    } finally {
      setCreating(false)
    }
  }

  // ── 管理 tab ──
  const [manageDir, setManageDir] = useState(initialManageDir ?? '')
  const [view, setView] = useState<TaskspaceView | null>(null)
  const [manageMsg, setManageMsg] = useState('')
  const [manageBusy, setManageBusy] = useState(false)
  const [addPath, setAddPath] = useState('')

  const loadInfo = async () => {
    const d = manageDir.trim()
    if (!d) { setManageMsg('请填工作区目录'); return }
    setManageBusy(true); setManageMsg(''); setView(null)
    try {
      setView(await getTaskspaceInfo(d))
    } catch (e) {
      setManageMsg(errText(e))
    } finally {
      setManageBusy(false)
    }
  }

  const doAdd = async () => {
    const p = addPath.trim()
    if (!p || !view) return
    setManageBusy(true); setManageMsg('')
    try {
      setView(await addTaskspaceMembers(view.dir, [p]))
      setAddPath('')
    } catch (e) {
      setManageMsg(errText(e))
    } finally {
      setManageBusy(false)
    }
  }

  const doRemove = async (link: string) => {
    if (!view) return
    const ok = await confirm({
      title: '移除链接',
      description: `仅删除链接「${link}」，源项目目录不受影响。`,
      confirmText: '移除',
      variant: 'destructive',
    })
    if (!ok) return
    setManageBusy(true); setManageMsg('')
    try {
      setView(await removeTaskspaceLinks(view.dir, [link]))
    } catch (e) {
      setManageMsg(errText(e))
    } finally {
      setManageBusy(false)
    }
  }

  const doTeardown = async () => {
    if (!view) return
    const ok = await confirm({
      title: '拆除整个工作区',
      description: '只删除所有链接与清单，绝不触碰源项目目录；目录非空则保留。此操作不可撤销。',
      confirmText: '拆除',
      variant: 'destructive',
    })
    if (!ok) return
    setManageBusy(true); setManageMsg('')
    try {
      await teardownTaskspace(view.dir)
      setView(null)
      setManageMsg('已拆除（源目录完好）')
    } catch (e) {
      setManageMsg(errText(e))
    } finally {
      setManageBusy(false)
    }
  }

  return (
    <div className="border-b px-3 py-3 text-sm">
      {/* 标题 + tab + 关闭 */}
      <div className="mb-3 flex items-center gap-2">
        <FolderTree className="size-4 text-[var(--color-primary)]" />
        <span className="font-medium">合并工作区</span>
        <div className="ml-2 flex gap-1">
          <TabBtn active={tab === 'create'} onClick={() => setTab('create')}>新建</TabBtn>
          <TabBtn active={tab === 'manage'} onClick={() => setTab('manage')}>管理</TabBtn>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="ml-auto rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
        >
          <X className="size-4" />
        </button>
      </div>

      {tab === 'create' ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--color-muted-foreground)]">父目录（在它下面选要聚合的子目录）</label>
            <div className="mt-1 flex gap-2">
              <Input
                value={parent}
                onChange={e => setParent(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !loading) loadSubdirs() }}
                placeholder="例如 D:\bigdir"
              />
              <Button variant="outline" size="sm" disabled={loading} onClick={loadSubdirs} className="shrink-0">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                加载子目录
              </Button>
            </div>
          </div>

          {subdirs && subdirs.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-md border">
              {subdirs.map(d => {
                const on = selected.has(d.path)
                return (
                  <label
                    key={d.path}
                    className="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 last:border-b-0 hover:bg-[var(--color-accent)]"
                  >
                    <input type="checkbox" checked={on} onChange={() => toggle(d.path)} className="size-4" />
                    <span className="flex-1 truncate">{d.name}</span>
                    {d.isLink && (
                      <span className="flex items-center gap-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                        <Link2 className="size-3" />链接
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          )}

          {selected.size > 0 && (
            <p className="text-xs text-[var(--color-muted-foreground)]">已选 {selected.size} 个目录</p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-[var(--color-muted-foreground)]">工作区名称</label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="例如 任务A" className="mt-1" />
            </div>
            <div>
              <label className="text-xs text-[var(--color-muted-foreground)]">放置目录（base，默认=父目录）</label>
              <Input value={base} onChange={e => setBase(e.target.value)} placeholder="默认与父目录相同" className="mt-1" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" disabled={creating || !selected.size} onClick={doCreate}>
              {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              创建并设为 cwd
            </Button>
            {createMsg && <span className="text-xs text-[var(--color-destructive)]">{createMsg}</span>}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--color-muted-foreground)]">工作区目录</label>
            <div className="mt-1 flex gap-2">
              <Input
                value={manageDir}
                onChange={e => setManageDir(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !manageBusy) loadInfo() }}
                placeholder="例如 D:\bigdir\任务A"
              />
              <Button variant="outline" size="sm" disabled={manageBusy} onClick={loadInfo} className="shrink-0">
                {manageBusy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                查看
              </Button>
            </div>
          </div>

          {view && (
            <>
              <div className="text-xs text-[var(--color-muted-foreground)]">
                {view.name} · 共 {view.members.length} 个链接
              </div>
              <div className="max-h-40 overflow-y-auto rounded-md border">
                {view.members.length === 0 && (
                  <p className="px-3 py-2 text-xs text-[var(--color-muted-foreground)]">暂无链接</p>
                )}
                {view.members.map(m => (
                  <div key={m.link} className="flex items-center gap-2 border-b px-3 py-1.5 last:border-b-0">
                    <span className={m.alive ? 'text-emerald-500' : 'text-[var(--color-muted-foreground)]'}>●</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{m.link}</div>
                      <div className="truncate text-[10px] text-[var(--color-muted-foreground)]">{m.target}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => doRemove(m.link)}
                      disabled={manageBusy}
                      aria-label={`移除 ${m.link}`}
                      className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-destructive)]"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  value={addPath}
                  onChange={e => setAddPath(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !manageBusy) doAdd() }}
                  placeholder="追加一个项目目录绝对路径"
                />
                <Button variant="outline" size="sm" disabled={manageBusy || !addPath.trim()} onClick={doAdd} className="shrink-0">
                  <Plus className="size-4" />追加
                </Button>
              </div>

              <Button variant="destructive" size="sm" disabled={manageBusy} onClick={doTeardown}>
                <Trash2 className="size-4" />拆除整个工作区（只删链接）
              </Button>
            </>
          )}

          {manageMsg && <p className="text-xs text-[var(--color-muted-foreground)]">{manageMsg}</p>}
        </div>
      )}
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-0.5 text-xs ${active
        ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
        : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'}`}
    >
      {children}
    </button>
  )
}
