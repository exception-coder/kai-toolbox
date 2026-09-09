import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Check, ChevronRight, KeyRound, LoaderCircle, LockKeyhole, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, UsersRound, X } from 'lucide-react'
import { Permission } from '@/components/auth/Permission'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { usePermission } from '@/shell/permission'
import { createRole, deleteRole, listRoles, updateRole, type RoleSaveRequest, type RoleView } from '../api'
import { PermissionExplorer } from '../components/PermissionExplorer'

const ROLES_KEY = ['forge-roles']
const DATA_SCOPES = [
  { value: 'ALL', label: '全部数据', description: '可访问全部业务数据' },
  { value: 'DEPT', label: '本部门', description: '仅访问所属部门数据' },
  { value: 'SELF', label: '仅本人', description: '仅访问本人相关数据' },
  { value: 'CUSTOM', label: '自定义', description: '按已配置范围访问' },
] as const

interface FormState {
  id: number | null
  name: string
  code: string
  description: string
  dataScopeType: string
  status: string
  builtin: boolean
}

const emptyForm = (): FormState => ({ id: null, name: '', code: '', description: '', dataScopeType: 'SELF', status: 'ENABLED', builtin: false })

/** 角色管理：CRUD + 按模块分组的权限码勾选绑定。内置角色只读保护。 */
export function RolePage() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const canEdit = usePermission('forge:role:btn:edit')
  const rolesQuery = useQuery({ queryKey: ROLES_KEY, queryFn: listRoles })
  const roles = rolesQuery.data ?? []
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ROLES_KEY })
  const [form, setForm] = useState<FormState | null>(null)
  const [bindRole, setBindRole] = useState<RoleView | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: (value: FormState) => {
      const request: RoleSaveRequest = {
        name: value.name.trim(), code: value.code.trim(), description: value.description.trim() || null,
        dataScopeType: value.dataScopeType, status: value.status,
      }
      return value.id == null ? createRole(request) : updateRole(value.id, request)
    },
    onSuccess: () => { setForm(null); setMutationError(null); invalidate() },
    onError: (error) => setMutationError((error as Error).message),
  })
  const remove = useMutation({
    mutationFn: (id: number) => deleteRole(id),
    onSuccess: () => { setMutationError(null); invalidate() },
    onError: (error) => setMutationError((error as Error).message),
  })

  const startCreate = () => { setForm(emptyForm()); setMutationError(null) }
  const startEdit = (role: RoleView) => {
    setForm({ id: role.id, name: role.name, code: role.code, description: role.description ?? '', dataScopeType: role.dataScopeType, status: role.status, builtin: role.builtin })
    setMutationError(null)
  }
  const doDelete = async (role: RoleView) => {
    const confirmed = await confirm({ title: '删除角色', description: `确认删除角色「${role.name}」？如果仍有用户绑定此角色，系统会拒绝删除。`, variant: 'destructive' })
    if (confirmed) remove.mutate(role.id)
  }

  if (bindRole) return <PermissionExplorer role={bindRole} onClose={() => setBindRole(null)} />

  const enabledCount = roles.filter((role) => role.status === 'ENABLED').length
  const builtinCount = roles.filter((role) => role.builtin).length

  return (
    <main className="mx-auto w-full max-w-[1240px] px-5 py-6 sm:px-8 sm:py-8 lg:px-12">
      <header className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--color-muted-foreground)]"><ShieldCheck className="size-3.5" />权限治理<ChevronRight className="size-3" />角色</div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[28px]">角色管理</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--color-muted-foreground)]">定义团队职责、数据可见范围，以及每类成员能够使用的功能。</p>
        </div>
        <Permission code="forge:role:btn:edit">
          <Button onClick={startCreate} disabled={form?.id == null} className="self-start sm:self-auto"><Plus className="size-4" />新建角色</Button>
        </Permission>
      </header>

      <section aria-label="角色概览" className="grid grid-cols-3 border-b py-5 sm:w-fit sm:min-w-[420px]">
        <SummaryStat label="全部角色" value={roles.length} />
        <SummaryStat label="已启用" value={enabledCount} emphasized />
        <SummaryStat label="内置角色" value={builtinCount} />
      </section>

      {form && <RoleForm form={form} pending={save.isPending} error={mutationError} onChange={setForm} onSubmit={() => save.mutate(form)} onCancel={() => { setForm(null); setMutationError(null) }} />}
      {!form && mutationError && <InlineError message={mutationError} onDismiss={() => setMutationError(null)} />}

      <section className="pt-8" aria-labelledby="role-list-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 id="role-list-title" className="text-base font-semibold">角色列表</h2>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">内置角色可查看和编辑说明，但不可删除或重新分配权限。</p>
          </div>
          {!rolesQuery.isPending && !rolesQuery.isError && <span className="shrink-0 text-xs tabular-nums text-[var(--color-muted-foreground)]">{roles.length} 个角色</span>}
        </div>
        {rolesQuery.isPending ? <LoadingState /> : rolesQuery.isError ? <LoadError onRetry={() => rolesQuery.refetch()} pending={rolesQuery.isFetching} /> : roles.length === 0 ? <EmptyState canCreate={canEdit} onCreate={startCreate} /> : (
          <RoleList roles={roles} canEdit={canEdit} deletingId={remove.isPending ? remove.variables : undefined} onEdit={startEdit} onBind={setBindRole} onDelete={doDelete} />
        )}
      </section>
    </main>
  )
}

function SummaryStat({ label, value, emphasized = false }: { label: string; value: number; emphasized?: boolean }) {
  return <div className="border-l px-4 first:border-l-0 first:pl-0"><p className="text-xs text-[var(--color-muted-foreground)]">{label}</p><p className={cn('mt-1 text-xl font-semibold tabular-nums', emphasized && 'text-[var(--color-primary)]')}>{value}</p></div>
}

function RoleList({ roles, canEdit, deletingId, onEdit, onBind, onDelete }: { roles: RoleView[]; canEdit: boolean; deletingId?: number; onEdit: (role: RoleView) => void; onBind: (role: RoleView) => void; onDelete: (role: RoleView) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-[var(--color-card)]">
      <div className="hidden grid-cols-[minmax(0,1.7fr)_minmax(120px,0.75fr)_100px_112px_minmax(176px,auto)] gap-4 border-b bg-[var(--color-muted)]/35 px-4 py-2.5 text-[11px] font-medium text-[var(--color-muted-foreground)] md:grid"><span>角色</span><span>编码</span><span>数据范围</span><span>状态</span><span className="text-right">操作</span></div>
      <ul className="divide-y" aria-label="角色列表">
        {roles.map((role) => <RoleRow key={role.id} role={role} canEdit={canEdit} deleting={deletingId === role.id} onEdit={() => onEdit(role)} onBind={() => onBind(role)} onDelete={() => onDelete(role)} />)}
      </ul>
    </div>
  )
}

function RoleRow({ role, canEdit, deleting, onEdit, onBind, onDelete }: { role: RoleView; canEdit: boolean; deleting: boolean; onEdit: () => void; onBind: () => void; onDelete: () => void }) {
  const scope = DATA_SCOPES.find((item) => item.value === role.dataScopeType)
  const enabled = role.status === 'ENABLED'
  return (
    <li className="group px-4 py-4 transition-colors hover:bg-[var(--color-muted)]/20">
      <div className="grid items-center gap-x-4 gap-y-3 md:grid-cols-[minmax(0,1.7fr)_minmax(120px,0.75fr)_100px_112px_minmax(176px,auto)]">
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg', enabled ? 'bg-[color-mix(in_oklab,var(--color-primary)_10%,transparent)] text-[var(--color-primary)]' : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]')}>{role.builtin ? <LockKeyhole className="size-4" /> : <UsersRound className="size-4" />}</span>
          <span className="min-w-0"><span className="flex items-center gap-2"><span className="truncate text-sm font-medium" title={role.name}>{role.name}</span>{role.builtin && <span className="shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">内置</span>}</span><span className="mt-0.5 block truncate text-xs text-[var(--color-muted-foreground)]" title={role.description ?? undefined}>{role.description || '暂无角色说明'}</span></span>
        </div>
        <div className="min-w-0 pl-12 md:pl-0"><span className="font-mono text-xs text-[var(--color-muted-foreground)]" title={role.code}>{role.code}</span></div>
        <div className="pl-12 text-xs md:pl-0" title={scope?.description}>{scope?.label ?? role.dataScopeType}</div>
        <div className="flex items-center gap-2 pl-12 text-xs md:pl-0"><span className={cn('size-1.5 rounded-full', enabled ? 'bg-emerald-500' : 'bg-[var(--color-muted-foreground)]')} aria-hidden />{enabled ? '已启用' : '已停用'}</div>
        {canEdit && <div className="flex flex-wrap items-center gap-1 pl-10 md:justify-end md:pl-0">
          <Permission code="forge:role:btn:bind"><Button size="sm" variant="ghost" disabled={role.builtin} onClick={onBind} title={role.builtin ? '内置角色权限不可调整' : undefined}><KeyRound className="size-3.5" />分配权限</Button></Permission>
          <Button size="icon" variant="ghost" onClick={onEdit} aria-label={`编辑角色 ${role.name}`}><Pencil className="size-3.5" /></Button>
          <Permission code="forge:role:btn:delete"><Button size="icon" variant="ghost" className="text-[var(--color-destructive)]" disabled={role.builtin || deleting} onClick={onDelete} aria-label={`删除角色 ${role.name}`}>{deleting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}</Button></Permission>
        </div>}
      </div>
    </li>
  )
}

function RoleForm({ form, pending, error, onChange, onSubmit, onCancel }: { form: FormState; pending: boolean; error: string | null; onChange: (form: FormState) => void; onSubmit: () => void; onCancel: () => void }) {
  const inputClass = 'h-10 w-full rounded-lg border bg-[var(--color-background)] px-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-[var(--color-muted-foreground)] focus:border-[color-mix(in_oklab,var(--color-primary)_55%,var(--color-border))] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--color-primary)_14%,transparent)] disabled:cursor-not-allowed disabled:opacity-60'
  return (
    <section className="border-b py-6" aria-labelledby="role-form-title">
      <div className="mb-5 flex items-start justify-between gap-4"><div><h2 id="role-form-title" className="text-base font-semibold">{form.id == null ? '新建角色' : `编辑 ${form.name}`}</h2><p className="mt-1 text-xs leading-5 text-[var(--color-muted-foreground)]">先定义角色身份和数据范围，保存后再分配具体功能权限。</p></div><Button size="icon" variant="ghost" onClick={onCancel} aria-label="关闭角色编辑"><X className="size-4" /></Button></div>
      {form.builtin && <div className="mb-5 flex items-start gap-2 border-l-2 border-[var(--color-primary)] bg-[var(--color-muted)]/30 px-3 py-2.5 text-xs leading-5"><LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-[var(--color-primary)]" /><span>这是系统内置角色。角色编码与启用状态受保护，仍可完善名称、说明和数据范围。</span></div>}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="角色名称" required><input className={inputClass} placeholder="例如：项目管理员" value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} /></Field>
        <Field label="角色编码" required hint={form.builtin ? '内置角色编码不可修改' : '建议使用大写字母与下划线'}><input className={inputClass} placeholder="例如：PROJECT_ADMIN" value={form.code} disabled={form.builtin} onChange={(event) => onChange({ ...form, code: event.target.value })} /></Field>
        <Field label="角色说明" className="md:col-span-2"><input className={inputClass} placeholder="说明这个角色适用于哪些成员和职责" value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} /></Field>
        <Field label="数据范围" hint={DATA_SCOPES.find((item) => item.value === form.dataScopeType)?.description}><select className={inputClass} value={form.dataScopeType} onChange={(event) => onChange({ ...form, dataScopeType: event.target.value })}>{DATA_SCOPES.map((scope) => <option key={scope.value} value={scope.value}>{scope.label}</option>)}</select></Field>
        <Field label="角色状态" hint={form.status === 'ENABLED' ? '成员可正常获得此角色权限' : '已绑定成员将无法通过此角色访问'}><select className={inputClass} value={form.status} disabled={form.builtin} onChange={(event) => onChange({ ...form, status: event.target.value })}><option value="ENABLED">启用</option><option value="DISABLED">停用</option></select></Field>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t pt-4">{error && <p role="alert" className="flex min-w-0 flex-1 items-center gap-2 text-xs text-[var(--color-destructive)]"><AlertCircle className="size-3.5 shrink-0" />{error}</p>}<div className="ml-auto flex items-center gap-2"><Button variant="ghost" onClick={onCancel} disabled={pending}>取消</Button><Button disabled={!form.name.trim() || !form.code.trim() || pending} onClick={onSubmit} className="min-w-24">{pending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}{pending ? '保存中' : '保存角色'}</Button></div></div>
    </section>
  )
}

function Field({ label, required, hint, className, children }: { label: string; required?: boolean; hint?: string; className?: string; children: React.ReactNode }) {
  return <label className={cn('block', className)}><span className="mb-2 flex items-center gap-1 text-xs font-medium">{label}{required && <span className="text-[var(--color-destructive)]" aria-hidden>*</span>}</span>{children}{hint && <span className="mt-1.5 block text-[11px] text-[var(--color-muted-foreground)]">{hint}</span>}</label>
}

function InlineError({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return <div role="alert" className="mt-5 flex items-center gap-2 border-l-2 border-[var(--color-destructive)] bg-[color-mix(in_oklab,var(--color-destructive)_6%,transparent)] px-3 py-2.5 text-xs text-[var(--color-destructive)]"><AlertCircle className="size-3.5 shrink-0" /><span className="min-w-0 flex-1">{message}</span><button type="button" onClick={onDismiss} className="rounded p-1 hover:bg-[color-mix(in_oklab,var(--color-destructive)_10%,transparent)]" aria-label="关闭错误提示"><X className="size-3.5" /></button></div>
}

function LoadingState() {
  return <div className="flex min-h-40 items-center gap-2 border-y py-8 text-sm text-[var(--color-muted-foreground)]"><LoaderCircle className="size-4 animate-spin" />正在加载角色…</div>
}

function LoadError({ onRetry, pending }: { onRetry: () => void; pending: boolean }) {
  return <div role="alert" className="border-y py-8"><div className="flex items-center gap-2 text-sm font-medium"><AlertCircle className="size-4 text-[var(--color-destructive)]" />角色暂时无法加载</div><p className="mt-2 max-w-xl text-xs leading-5 text-[var(--color-muted-foreground)]">请检查服务连接后重试。当前页面上下文会保留，不会影响已有角色配置。</p><Button size="sm" variant="outline" className="mt-4" onClick={onRetry} disabled={pending}><RefreshCw className={cn('size-3.5', pending && 'animate-spin')} />重新加载</Button></div>
}

function EmptyState({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) {
  return <div className="border-y py-8"><h3 className="text-sm font-medium">还没有可用角色</h3><p className="mt-2 max-w-xl text-xs leading-5 text-[var(--color-muted-foreground)]">创建角色后，可以继续配置数据范围与模块权限。</p>{canCreate && <Button size="sm" className="mt-4" onClick={onCreate}><Plus className="size-3.5" />创建第一个角色</Button>}</div>
}
