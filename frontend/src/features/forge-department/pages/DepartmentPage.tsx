import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, FolderPlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Permission } from '@/components/auth/Permission'
import { usePermission } from '@/shell/permission'
import {
  createDepartment,
  deleteDepartment,
  fetchDepartmentTree,
  updateDepartment,
  type DepartmentNode,
  type DepartmentSaveRequest,
} from '../api'

const KEY = ['forge-departments']

interface FormState {
  id: number | null
  parentId: number
  name: string
  code: string
  sort: number
  status: string
}

const emptyForm = (parentId = 0): FormState => ({
  id: null,
  parentId,
  name: '',
  code: '',
  sort: 0,
  status: 'ENABLED',
})

/** 部门树管理：增删改 + 层级/排序维护。菜单/按钮由 Forge 权限码门禁。 */
export function DepartmentPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const canEdit = usePermission('forge:dept:btn:edit')
  const { data: tree = [], isPending } = useQuery({ queryKey: KEY, queryFn: fetchDepartmentTree })
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY })

  const [form, setForm] = useState<FormState | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const req: DepartmentSaveRequest = {
        parentId: f.parentId,
        name: f.name.trim(),
        code: f.code.trim() || null,
        sort: f.sort,
        status: f.status,
      }
      return f.id == null ? createDepartment(req) : updateDepartment(f.id, req)
    },
    onSuccess: () => {
      setForm(null)
      setErr(null)
      invalidate()
    },
    onError: (e) => setErr((e as Error).message),
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteDepartment(id),
    onSuccess: invalidate,
    onError: (e) => setErr((e as Error).message),
  })

  const startEdit = (n: DepartmentNode) =>
    setForm({ id: n.id, parentId: n.parentId, name: n.name, code: n.code ?? '', sort: n.sort, status: n.status })
  const doDelete = async (n: DepartmentNode) => {
    const ok = await confirm({
      title: '删除部门',
      description: `确认删除「${n.name}」？含子部门或用户时会被拒绝。`,
      variant: 'destructive',
    })
    if (ok) remove.mutate(n.id)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-6 py-8 md:px-8 md:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">部门管理</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">维护组织层级、部门编码与启用状态。</p>
        </div>
        <Permission code="forge:dept:btn:edit">
          <Button onClick={() => setForm(emptyForm(0))}>
            <FolderPlus className="size-4" /> 新增根部门
          </Button>
        </Permission>
      </div>
      {err && <p className="text-sm text-[var(--color-destructive)]">{err}</p>}

      {form && (
        <DepartmentForm
          form={form}
          tree={tree}
          pending={save.isPending}
          onChange={setForm}
          onSubmit={() => save.mutate(form)}
          onCancel={() => {
            setForm(null)
            setErr(null)
          }}
        />
      )}

      {isPending ? (
        <div className="text-sm text-[var(--color-muted-foreground)]">加载中…</div>
      ) : tree.length === 0 ? (
        <div className="text-sm text-[var(--color-muted-foreground)]">暂无部门。</div>
      ) : (
        <section aria-label="部门组织结构" className="overflow-hidden rounded-xl border bg-[var(--color-card)]">
          <div className="flex items-center gap-2 border-b bg-[var(--color-muted)]/40 px-4 py-3 text-xs font-medium text-[var(--color-muted-foreground)]">
            <Building2 className="size-4" />
            <span>组织结构</span>
          </div>
          {tree.map((n) => (
            <DepartmentRow
              key={n.id}
              node={n}
              depth={0}
              canEdit={canEdit}
              onAddChild={(parentId) => setForm(emptyForm(parentId))}
              onEdit={startEdit}
              onDelete={doDelete}
            />
          ))}
        </section>
      )}
    </div>
  )
}

function DepartmentRow({
  node,
  depth,
  canEdit,
  onAddChild,
  onEdit,
  onDelete,
}: {
  node: DepartmentNode
  depth: number
  canEdit: boolean
  onAddChild: (parentId: number) => void
  onEdit: (n: DepartmentNode) => void
  onDelete: (n: DepartmentNode) => void
}) {
  return (
    <>
      <div
        className="group relative flex min-h-14 items-center gap-3 border-b px-4 text-sm last:border-b-0 hover:bg-[var(--color-accent)]/60 focus-within:bg-[var(--color-accent)]/60"
        style={{ paddingLeft: 16 + depth * 28 }}
      >
        {depth > 0 && <span aria-hidden className="absolute top-0 bottom-0 w-px bg-[var(--color-border)]" style={{ left: 28 + (depth - 1) * 28 }} />}
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
          <Building2 className="size-3.5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-[var(--color-foreground)]">{node.name}</span>
            {depth === 0 && <span className="text-xs text-[var(--color-muted-foreground)]">根部门</span>}
            {node.status === 'DISABLED' && <span className="rounded-md bg-[var(--color-muted)] px-1.5 py-0.5 text-[11px] text-[var(--color-muted-foreground)]">已停用</span>}
          </div>
          {node.code && <div className="mt-0.5 font-mono text-xs text-[var(--color-muted-foreground)]">{node.code}</div>}
        </div>
        {canEdit && (
          <div className="ml-auto flex shrink-0 gap-1 opacity-70 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <Button size="icon" variant="ghost" className="size-8" title="新增子部门" aria-label={`为${node.name}新增子部门`} onClick={() => onAddChild(node.id)}>
              <Plus className="size-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="size-8" title="编辑部门" aria-label={`编辑${node.name}`} onClick={() => onEdit(node)}>
              <Pencil className="size-3.5" />
            </Button>
            <Permission code="forge:dept:btn:delete">
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                title="删除部门"
                aria-label={`删除${node.name}`}
                onClick={() => onDelete(node)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </Permission>
          </div>
        )}
      </div>
      {node.children.map((c) => (
        <DepartmentRow
          key={c.id}
          node={c}
          depth={depth + 1}
          canEdit={canEdit}
          onAddChild={onAddChild}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </>
  )
}

function DepartmentForm({
  form,
  tree,
  pending,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: FormState
  tree: DepartmentNode[]
  pending: boolean
  onChange: (f: FormState) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const flat = flatten(tree)
  const inputCls = 'rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm'
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="text-sm font-medium">{form.id == null ? '新增部门' : `编辑部门 #${form.id}`}</div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-[var(--color-muted-foreground)]">上级</label>
        <select
          className={inputCls}
          value={form.parentId}
          onChange={(e) => onChange({ ...form, parentId: Number(e.target.value) })}
        >
          <option value={0}>（根）</option>
          {flat
            .filter((f) => f.id !== form.id)
            .map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
        </select>
        <input
          className={`${inputCls} w-40`}
          placeholder="部门名称"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
        />
        <input
          className={`${inputCls} w-32`}
          placeholder="编码（可空）"
          value={form.code}
          onChange={(e) => onChange({ ...form, code: e.target.value })}
        />
        <input
          type="number"
          className={`${inputCls} w-20`}
          placeholder="排序"
          value={form.sort}
          onChange={(e) => onChange({ ...form, sort: Number(e.target.value) })}
        />
        <select
          className={inputCls}
          value={form.status}
          onChange={(e) => onChange({ ...form, status: e.target.value })}
        >
          <option value="ENABLED">启用</option>
          <option value="DISABLED">停用</option>
        </select>
        <Button size="sm" disabled={!form.name.trim() || pending} onClick={onSubmit}>
          保存
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  )
}

function flatten(nodes: DepartmentNode[], depth = 0): { id: number; label: string }[] {
  return nodes.flatMap((n) => [
    { id: n.id, label: `${'　'.repeat(depth)}${n.name}` },
    ...flatten(n.children, depth + 1),
  ])
}
