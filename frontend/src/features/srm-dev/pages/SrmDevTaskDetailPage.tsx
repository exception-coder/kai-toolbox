import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Database, Loader2, Pencil, Plus, Settings2, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  createConfigChange, createSqlChange, deleteConfigChange, deleteSqlChange,
  getTask, updateConfigChange, updateSqlChange, updateTask,
  STATUS_LABEL,
  type ConfigChange, type ConfigChangeInput, type SqlChange, type SqlChangeInput, type TaskStatus,
} from '../tasksApi'

const STATUSES: TaskStatus[] = ['open', 'developing', 'done', 'archived']

const inputCls = 'mt-1 w-full rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]'
const taCls = 'mt-1 w-full resize-y rounded-md border bg-[var(--color-background)] px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]'

/** SRM 开发任务详情：任务元信息编辑 + 其下 SQL 变更登记、配置变更登记的增删改（纯台账）。 */
export function SrmDevTaskDetailPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { data, isLoading, isError } = useQuery({ queryKey: ['srm-dev-task', id], queryFn: () => getTask(id), enabled: !!id })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['srm-dev-task', id] })
    qc.invalidateQueries({ queryKey: ['srm-dev-tasks'] })
  }

  const saveStatus = useMutation({
    mutationFn: (status: TaskStatus) => updateTask(id, {
      title: data!.task.title, moduleName: data!.task.moduleName ?? '',
      requirement: data!.task.requirement ?? '', owner: data!.task.owner ?? '', status,
    }),
    onSuccess: invalidate,
  })

  if (isLoading) {
    return <div className="mx-auto max-w-3xl p-6 text-sm text-[var(--color-muted-foreground)]"><Loader2 className="inline size-4 animate-spin" /> 加载中…</div>
  }
  if (isError || !data) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <Link to="/tools/srm-dev/tasks" className="text-sm text-[var(--color-primary)]">← 返回任务列表</Link>
        <p className="mt-4 text-sm text-[var(--color-destructive)]">任务不存在或加载失败。</p>
      </div>
    )
  }

  const { task, sqlChanges, configChanges } = data

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <div className="mb-1 flex items-center gap-2">
        <Link to="/tools/srm-dev/tasks" className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="truncate text-lg font-semibold">{task.title}</h1>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-7 text-[11px] text-[var(--color-muted-foreground)]">
        {task.moduleName && <span>模块：{task.moduleName}</span>}
        {task.owner && <span>负责人：{task.owner}</span>}
        <label className="flex items-center gap-1">状态：
          <select
            value={task.status}
            onChange={e => saveStatus.mutate(e.target.value as TaskStatus)}
            className="rounded border bg-[var(--color-background)] px-1 py-0.5 text-[11px]"
          >
            {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </label>
      </div>
      {task.requirement && (
        <p className="mb-5 whitespace-pre-wrap rounded-lg border bg-[var(--color-card)] p-3 text-sm text-[var(--color-muted-foreground)]">
          {task.requirement}
        </p>
      )}

      <SqlSection taskId={id} items={sqlChanges} confirm={confirm} onChanged={invalidate} />
      <ConfigSection taskId={id} items={configChanges} confirm={confirm} onChanged={invalidate} />
    </div>
  )
}

/* ============ SQL 变更登记 ============ */

const emptySql: SqlChangeInput = { title: '', dbName: '', changeType: 'DDL', sqlText: '', author: '' }

function SqlSection({ taskId, items, confirm, onChanged }: {
  taskId: string; items: SqlChange[]; confirm: ReturnType<typeof useConfirm>; onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const create = useMutation({ mutationFn: (b: SqlChangeInput) => createSqlChange(taskId, b), onSuccess: () => { setAdding(false); onChanged() } })
  const update = useMutation({ mutationFn: ({ id, b }: { id: string; b: SqlChangeInput }) => updateSqlChange(taskId, id, b), onSuccess: () => { setEditingId(null); onChanged() } })
  const toggle = useMutation({ mutationFn: (c: SqlChange) => updateSqlChange(taskId, c.id, { ...toInput(c), executed: !c.executed }), onSuccess: onChanged })
  const remove = useMutation({ mutationFn: (id: string) => deleteSqlChange(taskId, id), onSuccess: onChanged })

  const onDelete = async (c: SqlChange) => {
    if (await confirm({ title: '删除 SQL 登记', description: '确定删除这条 SQL 变更登记？', variant: 'destructive', confirmText: '删除' })) remove.mutate(c.id)
  }

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        <Database className="size-4 text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">SQL 变更登记</h2>
        <span className="text-[11px] text-[var(--color-muted-foreground)]">（{items.length}）</span>
        <Button size="sm" variant="outline" className="ml-auto gap-1" onClick={() => { setAdding(true); setEditingId(null) }}>
          <Plus className="size-4" />登记 SQL
        </Button>
      </div>

      {adding && <SqlForm initial={emptySql} pending={create.isPending} onCancel={() => setAdding(false)} onSubmit={b => create.mutate(b)} />}

      <ul className="space-y-2">
        {items.map(c => editingId === c.id ? (
          <li key={c.id}>
            <SqlForm initial={toInput(c)} pending={update.isPending} onCancel={() => setEditingId(null)} onSubmit={b => update.mutate({ id: c.id, b })} />
          </li>
        ) : (
          <li key={c.id} className="rounded-lg border bg-[var(--color-card)] p-3">
            <div className="flex items-center gap-2">
              {c.changeType && <span className="rounded bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-[10px] text-[var(--color-primary)]">{c.changeType}</span>}
              <span className="truncate text-sm font-medium">{c.title || '(未命名)'}</span>
              {c.dbName && <span className="text-[11px] text-[var(--color-muted-foreground)]">@ {c.dbName}</span>}
              <label className="ml-auto flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]">
                <input type="checkbox" checked={c.executed} onChange={() => toggle.mutate(c)} />已执行
              </label>
              <Button size="icon" variant="ghost" className="size-7" onClick={() => { setEditingId(c.id); setAdding(false) }} title="编辑"><Pencil className="size-3.5" /></Button>
              <Button size="icon" variant="ghost" className="size-7 hover:text-[var(--color-destructive)]" onClick={() => onDelete(c)} title="删除"><Trash2 className="size-3.5" /></Button>
            </div>
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded bg-[var(--color-background)] p-2 font-mono text-xs">{c.sqlText}</pre>
            {c.author && <div className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">登记人：{c.author}</div>}
          </li>
        ))}
      </ul>
      {items.length === 0 && !adding && <p className="text-xs text-[var(--color-muted-foreground)]">尚无 SQL 登记。</p>}
    </section>
  )
}

function toInput(c: SqlChange): SqlChangeInput {
  return { title: c.title ?? '', dbName: c.dbName ?? '', changeType: c.changeType ?? '', sqlText: c.sqlText, author: c.author ?? '', executed: c.executed, sortOrder: c.sortOrder }
}

function SqlForm({ initial, pending, onSubmit, onCancel }: {
  initial: SqlChangeInput; pending: boolean; onSubmit: (b: SqlChangeInput) => void; onCancel: () => void
}) {
  const [title, setTitle] = useState(initial.title ?? '')
  const [dbName, setDbName] = useState(initial.dbName ?? '')
  const [changeType, setChangeType] = useState(initial.changeType || 'DDL')
  const [sqlText, setSqlText] = useState(initial.sqlText)
  const [author, setAuthor] = useState(initial.author ?? '')

  return (
    <div className="mb-2 space-y-2 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-card)] p-3">
      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-3 sm:col-span-1 text-[11px] text-[var(--color-muted-foreground)]">变更说明
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="如：新增准入状态列" className="mt-1 h-8 text-xs" />
        </label>
        <label className="col-span-3 sm:col-span-1 text-[11px] text-[var(--color-muted-foreground)]">目标库
          <Input value={dbName} onChange={e => setDbName(e.target.value)} placeholder="如 srm_supplier" className="mt-1 h-8 text-xs" />
        </label>
        <label className="col-span-3 sm:col-span-1 text-[11px] text-[var(--color-muted-foreground)]">类型
          <select value={changeType} onChange={e => setChangeType(e.target.value)} className={inputCls + ' py-1.5'}>
            <option value="DDL">DDL（表结构）</option>
            <option value="DML">DML（数据）</option>
          </select>
        </label>
      </div>
      <label className="block text-[11px] text-[var(--color-muted-foreground)]">SQL 内容 *
        <textarea value={sqlText} onChange={e => setSqlText(e.target.value)} rows={4} placeholder="ALTER TABLE ... / INSERT INTO ..." className={taCls} />
      </label>
      <div className="flex items-center gap-2">
        <label className="text-[11px] text-[var(--color-muted-foreground)]">登记人
          <Input value={author} onChange={e => setAuthor(e.target.value)} placeholder="选填" className="ml-2 inline-block h-7 w-32 text-xs" />
        </label>
        <Button size="sm" className="ml-auto" disabled={pending || !sqlText.trim()} onClick={() => onSubmit({ title, dbName, changeType, sqlText, author })}>
          {pending && <Loader2 className="size-4 animate-spin" />}保存
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}><X className="size-4" /></Button>
      </div>
    </div>
  )
}

/* ============ 配置变更登记 ============ */

const emptyCfg: ConfigChangeInput = { configKey: '', scope: '', oldValue: '', newValue: '', remark: '' }

function ConfigSection({ taskId, items, confirm, onChanged }: {
  taskId: string; items: ConfigChange[]; confirm: ReturnType<typeof useConfirm>; onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const create = useMutation({ mutationFn: (b: ConfigChangeInput) => createConfigChange(taskId, b), onSuccess: () => { setAdding(false); onChanged() } })
  const update = useMutation({ mutationFn: ({ id, b }: { id: string; b: ConfigChangeInput }) => updateConfigChange(taskId, id, b), onSuccess: () => { setEditingId(null); onChanged() } })
  const toggle = useMutation({ mutationFn: (c: ConfigChange) => updateConfigChange(taskId, c.id, { ...cfgToInput(c), applied: !c.applied }), onSuccess: onChanged })
  const remove = useMutation({ mutationFn: (id: string) => deleteConfigChange(taskId, id), onSuccess: onChanged })

  const onDelete = async (c: ConfigChange) => {
    if (await confirm({ title: '删除配置登记', description: `确定删除配置项「${c.configKey}」的变更登记？`, variant: 'destructive', confirmText: '删除' })) remove.mutate(c.id)
  }

  return (
    <section className="mb-6">
      <div className="mb-2 flex items-center gap-2">
        <Settings2 className="size-4 text-[var(--color-primary)]" />
        <h2 className="text-sm font-semibold">配置变更登记</h2>
        <span className="text-[11px] text-[var(--color-muted-foreground)]">（{items.length}）</span>
        <Button size="sm" variant="outline" className="ml-auto gap-1" onClick={() => { setAdding(true); setEditingId(null) }}>
          <Plus className="size-4" />登记配置
        </Button>
      </div>

      {adding && <ConfigForm initial={emptyCfg} pending={create.isPending} onCancel={() => setAdding(false)} onSubmit={b => create.mutate(b)} />}

      <ul className="space-y-2">
        {items.map(c => editingId === c.id ? (
          <li key={c.id}>
            <ConfigForm initial={cfgToInput(c)} pending={update.isPending} onCancel={() => setEditingId(null)} onSubmit={b => update.mutate({ id: c.id, b })} />
          </li>
        ) : (
          <li key={c.id} className="rounded-lg border bg-[var(--color-card)] p-3">
            <div className="flex items-center gap-2">
              <span className="truncate font-mono text-sm font-medium">{c.configKey}</span>
              {c.scope && <span className="text-[11px] text-[var(--color-muted-foreground)]">@ {c.scope}</span>}
              <label className="ml-auto flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]">
                <input type="checkbox" checked={c.applied} onChange={() => toggle.mutate(c)} />已应用
              </label>
              <Button size="icon" variant="ghost" className="size-7" onClick={() => { setEditingId(c.id); setAdding(false) }} title="编辑"><Pencil className="size-3.5" /></Button>
              <Button size="icon" variant="ghost" className="size-7 hover:text-[var(--color-destructive)]" onClick={() => onDelete(c)} title="删除"><Trash2 className="size-3.5" /></Button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <code className="rounded bg-[var(--color-background)] px-1.5 py-0.5 text-[var(--color-muted-foreground)] line-through">{c.oldValue || '∅'}</code>
              <span className="text-[var(--color-muted-foreground)]">→</span>
              <code className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-600 dark:text-emerald-400">{c.newValue || '∅'}</code>
            </div>
            {c.remark && <div className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">备注：{c.remark}</div>}
          </li>
        ))}
      </ul>
      {items.length === 0 && !adding && <p className="text-xs text-[var(--color-muted-foreground)]">尚无配置变更登记。</p>}
    </section>
  )
}

function cfgToInput(c: ConfigChange): ConfigChangeInput {
  return { configKey: c.configKey, scope: c.scope ?? '', oldValue: c.oldValue ?? '', newValue: c.newValue ?? '', remark: c.remark ?? '', applied: c.applied, sortOrder: c.sortOrder }
}

function ConfigForm({ initial, pending, onSubmit, onCancel }: {
  initial: ConfigChangeInput; pending: boolean; onSubmit: (b: ConfigChangeInput) => void; onCancel: () => void
}) {
  const [configKey, setConfigKey] = useState(initial.configKey)
  const [scope, setScope] = useState(initial.scope ?? '')
  const [oldValue, setOldValue] = useState(initial.oldValue ?? '')
  const [newValue, setNewValue] = useState(initial.newValue ?? '')
  const [remark, setRemark] = useState(initial.remark ?? '')

  return (
    <div className="mb-2 space-y-2 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-card)] p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 sm:col-span-1 text-[11px] text-[var(--color-muted-foreground)]">配置项 key *
          <Input value={configKey} onChange={e => setConfigKey(e.target.value)} placeholder="如 srm.supplier.audit.enabled" className="mt-1 h-8 font-mono text-xs" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-[11px] text-[var(--color-muted-foreground)]">作用域 / 位置
          <Input value={scope} onChange={e => setScope(e.target.value)} placeholder="如 nacos:srm-system / application.yml" className="mt-1 h-8 text-xs" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-[11px] text-[var(--color-muted-foreground)]">旧值
          <Input value={oldValue} onChange={e => setOldValue(e.target.value)} placeholder="改前" className="mt-1 h-8 font-mono text-xs" />
        </label>
        <label className="col-span-2 sm:col-span-1 text-[11px] text-[var(--color-muted-foreground)]">新值
          <Input value={newValue} onChange={e => setNewValue(e.target.value)} placeholder="改后" className="mt-1 h-8 font-mono text-xs" />
        </label>
      </div>
      <label className="block text-[11px] text-[var(--color-muted-foreground)]">备注
        <Input value={remark} onChange={e => setRemark(e.target.value)} placeholder="选填：为什么改、注意事项" className="mt-1 h-8 text-xs" />
      </label>
      <div className="flex items-center gap-2">
        <Button size="sm" className="ml-auto" disabled={pending || !configKey.trim()} onClick={() => onSubmit({ configKey, scope, oldValue, newValue, remark })}>
          {pending && <Loader2 className="size-4 animate-spin" />}保存
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}><X className="size-4" /></Button>
      </div>
    </div>
  )
}
