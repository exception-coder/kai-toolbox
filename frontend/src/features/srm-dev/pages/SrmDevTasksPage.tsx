import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ClipboardList, Loader2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  createTask, deleteTask, listTasks,
  STATUS_LABEL, type DevTask, type TaskStatus,
} from '../tasksApi'

const STATUS_STYLE: Record<TaskStatus, string> = {
  open: 'bg-slate-500/10 text-slate-600 dark:text-slate-300',
  developing: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  done: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  archived: 'bg-zinc-500/10 text-zinc-500',
}

function fmt(ts: number) {
  try { return new Date(ts).toLocaleString('zh-CN', { hour12: false }) } catch { return String(ts) }
}

/**
 * SRM 开发任务列表：新建任务（标题/模块/需求/负责人/状态）+ 卡片列表，点进详情登记 SQL/配置变更。
 * 纯登记台账——这里只管理开发任务这一层。
 */
export function SrmDevTasksPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { data: tasks, isLoading } = useQuery({ queryKey: ['srm-dev-tasks'], queryFn: listTasks })

  const [title, setTitle] = useState('')
  const [moduleName, setModuleName] = useState('')
  const [owner, setOwner] = useState('')
  const [requirement, setRequirement] = useState('')
  const [showForm, setShowForm] = useState(false)

  const create = useMutation({
    mutationFn: () => createTask({ title: title.trim(), moduleName: moduleName.trim(), owner: owner.trim(), requirement: requirement.trim(), status: 'open' }),
    onSuccess: (t) => {
      setTitle(''); setModuleName(''); setOwner(''); setRequirement(''); setShowForm(false)
      qc.invalidateQueries({ queryKey: ['srm-dev-tasks'] })
      navigate(`/tools/srm-dev/tasks/${t.id}`)
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['srm-dev-tasks'] }),
  })

  const onDelete = async (t: DevTask) => {
    const ok = await confirm({
      title: '删除开发任务',
      description: `确定删除「${t.title}」？其下所有 SQL 登记与配置变更登记会一并删除，不可恢复。`,
      variant: 'destructive',
      confirmText: '删除',
    })
    if (ok) remove.mutate(t.id)
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Link to="/tools/srm-dev" className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
          <ArrowLeft className="size-5" />
        </Link>
        <ClipboardList className="size-5 text-[var(--color-primary)]" />
        <h1 className="text-lg font-semibold">SRM 开发任务</h1>
        <div className="ml-auto">
          <Button size="sm" onClick={() => setShowForm(v => !v)} className="gap-1">
            <Plus className="size-4" />新建任务
          </Button>
        </div>
      </div>
      <p className="mb-5 text-sm text-[var(--color-muted-foreground)]">
        每个开发任务下登记<b>SQL 变更</b>与<b>配置变更</b>两类清单，供发布时照单执行/交接。<b>纯台账，只登记不执行</b>。
      </p>

      {showForm && (
        <div className="mb-5 space-y-3 rounded-xl border bg-[var(--color-card)] p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="col-span-2 text-xs text-[var(--color-muted-foreground)]">任务标题 *
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="如：供应商准入增加按状态筛选" className="mt-1" />
            </label>
            <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">模块 / 页面
              <Input value={moduleName} onChange={e => setModuleName(e.target.value)} placeholder="如：供应商准入" className="mt-1" />
            </label>
            <label className="col-span-2 sm:col-span-1 text-xs text-[var(--color-muted-foreground)]">负责人
              <Input value={owner} onChange={e => setOwner(e.target.value)} placeholder="选填" className="mt-1" />
            </label>
            <label className="col-span-2 text-xs text-[var(--color-muted-foreground)]">需求描述
              <textarea
                value={requirement}
                onChange={e => setRequirement(e.target.value)}
                rows={3}
                placeholder="选填：这个任务要做什么"
                className="mt-1 w-full resize-y rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => create.mutate()} disabled={create.isPending || !title.trim()}>
              {create.isPending && <Loader2 className="size-4 animate-spin" />}创建
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>取消</Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
          <Loader2 className="size-4 animate-spin" />加载中…
        </div>
      ) : (tasks?.length ?? 0) === 0 ? (
        <div className="rounded-xl border border-dashed bg-[var(--color-card)] p-8 text-center text-sm text-[var(--color-muted-foreground)]">
          还没有开发任务，点右上「新建任务」开始。
        </div>
      ) : (
        <ul className="space-y-2">
          {tasks!.map(t => (
            <li key={t.id}>
              <div className="flex items-center gap-3 rounded-xl border bg-[var(--color-card)] p-3 transition-colors hover:border-[var(--color-primary)]/40">
                <Link to={`/tools/srm-dev/tasks/${t.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] ${STATUS_STYLE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
                    <span className="truncate font-medium">{t.title}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-[var(--color-muted-foreground)]">
                    {t.moduleName && <span>模块：{t.moduleName}</span>}
                    {t.owner && <span>负责人：{t.owner}</span>}
                    <span>更新于 {fmt(t.updatedAt)}</span>
                  </div>
                </Link>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => onDelete(t)}
                  className="text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                  title="删除任务"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
