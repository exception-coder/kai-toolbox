import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Permission } from '@/components/auth/Permission'
import { usePermission } from '@/shell/permission'
import {
  bindPermissions,
  createRole,
  deleteRole,
  getRole,
  listPermissions,
  listRoles,
  updateRole,
  type PermissionView,
  type RoleSaveRequest,
  type RoleView,
} from '../api'

const ROLES_KEY = ['forge-roles']
const PERMS_KEY = ['forge-permissions']
const DATA_SCOPES = ['ALL', 'DEPT', 'SELF', 'CUSTOM']

interface FormState {
  id: number | null
  name: string
  code: string
  description: string
  dataScopeType: string
  status: string
  builtin: boolean
}

const emptyForm = (): FormState => ({
  id: null,
  name: '',
  code: '',
  description: '',
  dataScopeType: 'SELF',
  status: 'ENABLED',
  builtin: false,
})

/** 角色管理：CRUD + 按模块分组的权限码勾选绑定。内置角色只读保护。 */
export function RolePage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const canEdit = usePermission('forge:role:btn:edit')
  const { data: roles = [], isPending } = useQuery({ queryKey: ROLES_KEY, queryFn: listRoles })
  const invalidate = () => qc.invalidateQueries({ queryKey: ROLES_KEY })

  const [form, setForm] = useState<FormState | null>(null)
  const [bindRole, setBindRole] = useState<RoleView | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: (f: FormState) => {
      const req: RoleSaveRequest = {
        name: f.name.trim(),
        code: f.code.trim(),
        description: f.description.trim() || null,
        dataScopeType: f.dataScopeType,
        status: f.status,
      }
      return f.id == null ? createRole(req) : updateRole(f.id, req)
    },
    onSuccess: () => {
      setForm(null)
      setErr(null)
      invalidate()
    },
    onError: (e) => setErr((e as Error).message),
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteRole(id),
    onSuccess: invalidate,
    onError: (e) => setErr((e as Error).message),
  })

  const startEdit = (r: RoleView) =>
    setForm({
      id: r.id,
      name: r.name,
      code: r.code,
      description: r.description ?? '',
      dataScopeType: r.dataScopeType,
      status: r.status,
      builtin: r.builtin,
    })
  const doDelete = async (r: RoleView) => {
    const ok = await confirm({
      title: '删除角色',
      description: `确认删除角色「${r.name}」？被用户绑定时会被拒绝。`,
      variant: 'destructive',
    })
    if (ok) remove.mutate(r.id)
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">角色管理</h2>
        <Permission code="forge:role:btn:edit">
          <Button size="sm" onClick={() => setForm(emptyForm())}>
            <Plus className="size-4" /> 新建角色
          </Button>
        </Permission>
      </div>
      {err && <p className="text-sm text-[var(--color-destructive)]">{err}</p>}

      {form && (
        <RoleForm
          form={form}
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
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
              <tr>
                <th className="px-3 py-2">名称</th>
                <th className="px-3 py-2">编码</th>
                <th className="w-24 px-3 py-2">数据范围</th>
                <th className="w-20 px-3 py-2">状态</th>
                <th className="w-56 px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {roles.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-medium">
                    {r.name}
                    {r.builtin && <span className="ml-1 text-xs text-[var(--color-muted-foreground)]">（内置）</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.code}</td>
                  <td className="px-3 py-2 text-xs">{r.dataScopeType}</td>
                  <td className="px-3 py-2 text-xs">{r.status === 'ENABLED' ? '启用' : '停用'}</td>
                  <td className="px-3 py-2">
                    {canEdit && (
                      <div className="flex flex-wrap gap-1">
                        <Permission code="forge:role:btn:bind">
                          <Button
                            size="sm"
                            variant="ghost"
                            title="分配权限"
                            disabled={r.builtin}
                            onClick={() => setBindRole(r)}
                          >
                            <KeyRound className="size-3.5" /> 权限
                          </Button>
                        </Permission>
                        <Button size="sm" variant="ghost" title="编辑" onClick={() => startEdit(r)}>
                          <Pencil className="size-3.5" />
                        </Button>
                        <Permission code="forge:role:btn:delete">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-[var(--color-destructive)]"
                            title="删除"
                            disabled={r.builtin}
                            onClick={() => doDelete(r)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </Permission>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bindRole && <PermissionBindPanel role={bindRole} onClose={() => setBindRole(null)} />}
    </div>
  )
}

function RoleForm({
  form,
  pending,
  onChange,
  onSubmit,
  onCancel,
}: {
  form: FormState
  pending: boolean
  onChange: (f: FormState) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const inputCls = 'rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm'
  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="text-sm font-medium">{form.id == null ? '新建角色' : `编辑角色 #${form.id}`}</div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputCls} w-40`}
          placeholder="角色名称"
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
        />
        <input
          className={`${inputCls} w-40`}
          placeholder="角色编码"
          value={form.code}
          disabled={form.builtin}
          title={form.builtin ? '内置角色编码不可修改' : ''}
          onChange={(e) => onChange({ ...form, code: e.target.value })}
        />
        <input
          className={`${inputCls} w-56`}
          placeholder="描述（可空）"
          value={form.description}
          onChange={(e) => onChange({ ...form, description: e.target.value })}
        />
        <select
          className={inputCls}
          value={form.dataScopeType}
          onChange={(e) => onChange({ ...form, dataScopeType: e.target.value })}
        >
          {DATA_SCOPES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className={inputCls}
          value={form.status}
          disabled={form.builtin}
          onChange={(e) => onChange({ ...form, status: e.target.value })}
        >
          <option value="ENABLED">启用</option>
          <option value="DISABLED">停用</option>
        </select>
        <Button size="sm" disabled={!form.name.trim() || !form.code.trim() || pending} onClick={onSubmit}>
          保存
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  )
}

function PermissionBindPanel({ role, onClose }: { role: RoleView; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: permissions = [] } = useQuery({ queryKey: PERMS_KEY, queryFn: listPermissions })
  const { data: detail } = useQuery({ queryKey: ['forge-role', role.id], queryFn: () => getRole(role.id) })
  const [checked, setChecked] = useState<Set<number> | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (detail && checked === null) setChecked(new Set(detail.permissionIds))
  }, [detail, checked])

  const grouped = useMemo(() => groupByModule(permissions), [permissions])
  const current = checked ?? new Set<number>()

  const save = useMutation({
    mutationFn: () => bindPermissions(role.id, [...current]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forge-role', role.id] })
      onClose()
    },
    onError: (e) => setErr((e as Error).message),
  })

  const toggle = (id: number) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setChecked(next)
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">分配权限：{role.name}</div>
        <div className="flex gap-1">
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            保存绑定
          </Button>
          <Button size="sm" variant="ghost" onClick={onClose}>
            关闭
          </Button>
        </div>
      </div>
      {err && <p className="text-sm text-[var(--color-destructive)]">{err}</p>}
      {detail == null ? (
        <div className="text-sm text-[var(--color-muted-foreground)]">加载中…</div>
      ) : (
        <div className="space-y-3">
          {[...grouped.entries()].map(([moduleName, perms]) => (
            <div key={moduleName} className="rounded-md border p-2">
              <div className="mb-1 text-xs font-medium text-[var(--color-muted-foreground)]">{moduleName}</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {perms.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-1 text-sm"
                    style={{ paddingLeft: p.parentCode ? 16 : 0 }}
                  >
                    <input type="checkbox" checked={current.has(p.id)} onChange={() => toggle(p.id)} />
                    <span>{p.name}</span>
                    <span className="text-xs text-[var(--color-muted-foreground)]">{p.code}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function groupByModule(permissions: PermissionView[]): Map<string, PermissionView[]> {
  const map = new Map<string, PermissionView[]>()
  for (const p of [...permissions].sort((a, b) => a.sort - b.sort)) {
    const list = map.get(p.module)
    if (list) list.push(p)
    else map.set(p.module, [p])
  }
  return map
}
