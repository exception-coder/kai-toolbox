import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Pencil, RotateCcw, Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Permission } from '@/components/auth/Permission'
import { usePrompt } from '@/components/ui/prompt-dialog'
import { useAuth } from '@/lib/auth'
import {
  assignUserRoles,
  createUser,
  deleteUser,
  fetchAllUserGrants,
  fetchForgeDeptTree,
  fetchForgeRoles,
  fetchUserGrant,
  listUsers,
  resetPassword,
  setEnabled,
  setUserDepartment,
  updateRealName,
  type AdminUser,
  type ForgeDeptNode,
} from '../api'

const KEY = ['admin-users']

/** 账号管理：仅 ADMIN 可用。列出账号并配置角色 / 启停 / 重置密码 / 删除。 */
export function AccountAdminPage() {
  const { user } = useAuth()
  const isAdmin = !!user?.roles?.includes('ADMIN')

  if (!isAdmin) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center gap-2 text-center text-[var(--color-muted-foreground)]">
        <p className="text-base font-medium">需要管理员权限</p>
        <p className="text-sm">请用具有 ADMIN 角色的账号登录后访问账号管理。</p>
      </div>
    )
  }
  return <AdminPanel />
}

function AdminPanel() {
  const qc = useQueryClient()
  const { data: users = [], isPending, isError, refetch } = useQuery({ queryKey: KEY, queryFn: listUsers })
  const { data: forgeRoles = [] } = useQuery({ queryKey: ['forge-roles'], queryFn: fetchForgeRoles })
  const { data: grants = [] } = useQuery({ queryKey: ['forge-user-grants'], queryFn: fetchAllUserGrants })
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY })

  // 账号 → 其 forge 角色名列表（真实权威来源）。
  const roleNameById = new Map(forgeRoles.map(r => [r.id, r.name]))
  const forgeRolesByUser = new Map(
    grants.map(g => [g.userId, g.roleIds.map(id => roleNameById.get(id) ?? `#${id}`)]),
  )

  const prompt = usePrompt()
  const [newName, setNewName] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [newRealName, setNewRealName] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [grantUser, setGrantUser] = useState<AdminUser | null>(null)

  // 新账号默认仅 USER（无任何菜单权限）；建号后由「授权」抽屉分配 Forge 角色/部门。
  const create = useMutation({
    mutationFn: () => createUser(newName.trim(), newPwd, ['USER'], newRealName.trim() || undefined),
    onSuccess: () => { setNewName(''); setNewPwd(''); setNewRealName(''); setErr(null); invalidate() },
    onError: e => setErr((e as Error).message),
  })
  const toggleEnabled = useMutation({
    mutationFn: (u: AdminUser) => setEnabled(u.userId, !u.enabled),
    onSuccess: invalidate,
    onError: e => setErr((e as Error).message),
  })
  const removeUser = useMutation({
    mutationFn: (id: number) => deleteUser(id),
    onSuccess: invalidate,
    onError: e => setErr((e as Error).message),
  })

  const doReset = async (u: AdminUser) => {
    const pwd = window.prompt(`为账号「${u.username}」设置新密码：`)
    if (!pwd) return
    try { await resetPassword(u.userId, pwd); window.alert('密码已重置') }
    catch (e) { setErr((e as Error).message) }
  }
  const doDelete = (u: AdminUser) => {
    if (window.confirm(`确认删除账号「${u.username}」？该操作不可恢复。`)) removeUser.mutate(u.userId)
  }
  const doRename = async (u: AdminUser) => {
    const name = await prompt({
      title: `修改姓名：${u.username}`,
      placeholder: '真实姓名（留空可清除）',
      defaultValue: u.realName ?? '',
    })
    if (name === null) return
    try { await updateRealName(u.userId, name.trim()); invalidate() }
    catch (e) { setErr((e as Error).message) }
  }

  const actions = (u: AdminUser) => (
    <div className="flex flex-wrap items-center gap-1">
      <Button size="sm" variant="ghost" aria-label={`修改 ${u.username} 的姓名`} onClick={() => void doRename(u)}><Pencil /> <span className="md:hidden">姓名</span></Button>
      <Permission code="forge:user:btn:assign">
        <Button size="sm" variant="ghost" aria-label={`授权 ${u.username}`} onClick={() => setGrantUser(u)}><KeyRound /> 授权</Button>
      </Permission>
      <Button size="sm" variant="ghost" aria-label={`重置 ${u.username} 的密码`} onClick={() => void doReset(u)}><RotateCcw /> <span className="md:hidden">密码</span></Button>
      <Button size="sm" variant="ghost" aria-label={`${u.enabled ? '停用' : '启用'} ${u.username}`} disabled={toggleEnabled.isPending} onClick={() => toggleEnabled.mutate(u)}>{u.enabled ? '停用' : '启用'}</Button>
      <Button size="sm" variant="ghost" className="text-[var(--color-destructive)]" aria-label={`删除 ${u.username}`} disabled={removeUser.isPending} onClick={() => doDelete(u)}><Trash2 /> <span className="md:hidden">删除</span></Button>
    </div>
  )

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 sm:px-6">
      <h2 className="text-xl font-semibold tracking-tight">账号管理</h2>
      {err && <p role="alert" className="text-sm text-[var(--color-destructive)]">{err}</p>}

      {grantUser && <GrantPanel user={grantUser} onClose={() => setGrantUser(null)} />}

      {/* 新建账号 */}
      <section aria-labelledby="create-account-heading" className="border-b border-[var(--color-border)] pb-6">
        <h3 id="create-account-heading" className="mb-3 flex items-center gap-2 text-sm font-semibold"><UserPlus className="size-4" /> 新建账号</h3>
        <form onSubmit={event => { event.preventDefault(); if (newName.trim() && newPwd && !create.isPending) create.mutate() }}>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-center">
            <input aria-label="用户名" autoComplete="username" className="h-10 min-w-0 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm" placeholder="用户名" value={newName} onChange={e => setNewName(e.target.value)} />
            <input aria-label="密码" type="password" autoComplete="new-password" className="h-10 min-w-0 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm" placeholder="密码" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
            <input aria-label="姓名（可空）" className="h-10 min-w-0 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm" placeholder="姓名（可空）" value={newRealName} onChange={e => setNewRealName(e.target.value)} />
            <Button type="submit" disabled={!newName.trim() || !newPwd || create.isPending} className="h-10 w-full sm:w-auto">{create.isPending ? '创建中…' : '创建'}</Button>
          </div>
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">建号后用「授权」分配角色/部门</p>
        </form>
      </section>

      {/* 账号列表 */}
      <section aria-label="账号列表">
      <div className="mb-3 flex items-baseline justify-between"><h3 className="text-sm font-semibold">已有账号</h3>{!isPending && !isError && <span className="text-xs text-[var(--color-muted-foreground)]">{users.length} 个</span>}</div>
      {isPending ? <p className="text-sm text-[var(--color-muted-foreground)]">正在加载账号…</p>
      : isError ? <p role="alert" className="text-sm">账号加载失败。<button type="button" className="text-[var(--color-primary)] underline" onClick={() => void refetch()}>重试</button></p>
      : users.length === 0 ? <p className="text-sm text-[var(--color-muted-foreground)]">暂无账号，可在上方创建。</p>
      : <>
        <ul className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)] md:hidden">
          {users.map(u => <li key={u.userId} className="py-3">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <p className="min-w-0 truncate font-medium">{u.username}</p>
              <span className={`shrink-0 text-xs ${u.enabled ? 'text-[var(--color-foreground)]' : 'text-[var(--color-muted-foreground)]'}`}>{u.enabled ? '启用' : '停用'}</span>
            </div>
            {(u.realName || (forgeRolesByUser.get(u.userId) ?? []).length > 0) && <p className="mt-1 break-words text-xs text-[var(--color-muted-foreground)]">{[u.realName, ...(forgeRolesByUser.get(u.userId) ?? [])].filter(Boolean).join(' · ')}</p>}
            <div className="mt-2 -ml-3">{actions(u)}</div>
          </li>)}
        </ul>
        <div className="hidden overflow-x-auto rounded-md border md:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
              <tr><th className="px-3 py-2">用户名</th><th className="px-3 py-2">姓名</th><th className="px-3 py-2">Forge 角色</th><th className="px-3 py-2 w-20">状态</th><th className="px-3 py-2 w-72">操作</th></tr>
            </thead>
            <tbody className="divide-y">
              {users.map(u => (
                <tr key={u.userId}>
                  <td className="px-3 py-2 font-medium">{u.username}</td>
                  <td className="px-3 py-2">{u.realName || <span className="text-[var(--color-muted-foreground)]">—</span>}</td>
                  <td className="px-3 py-2"><span className="text-xs">{(forgeRolesByUser.get(u.userId) ?? []).join(', ') || '—'}</span></td>
                  <td className="px-3 py-2 text-xs">{u.enabled ? '启用' : <span className="text-[var(--color-muted-foreground)]">停用</span>}</td>
                  <td className="px-3 py-2">{actions(u)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>}
      </section>
    </div>
  )
}

/** 用户授权抽屉：分配 Forge 多角色 + 单部门归属。变更于目标用户下次刷新/重登生效。 */
function GrantPanel({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: roles = [] } = useQuery({ queryKey: ['forge-roles'], queryFn: fetchForgeRoles })
  const { data: deptTree = [] } = useQuery({ queryKey: ['forge-departments'], queryFn: fetchForgeDeptTree })
  const { data: grant } = useQuery({ queryKey: ['forge-user-grant', user.userId], queryFn: () => fetchUserGrant(user.userId) })

  const [roleIds, setRoleIds] = useState<Set<number> | null>(null)
  const [deptId, setDeptId] = useState<number | null | undefined>(undefined)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (grant && roleIds === null) {
      setRoleIds(new Set(grant.roleIds))
      setDeptId(grant.departmentId)
    }
  }, [grant, roleIds])

  const current = roleIds ?? new Set<number>()
  const save = useMutation({
    mutationFn: async () => {
      await assignUserRoles(user.userId, [...current])
      await setUserDepartment(user.userId, deptId ?? null)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['forge-user-grants'] })
      qc.invalidateQueries({ queryKey: ['forge-user-grant', user.userId] })
      onClose()
    },
    onError: (e) => setErr((e as Error).message),
  })

  const toggle = (id: number) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setRoleIds(next)
  }

  return (
    <div className="space-y-3 rounded-md border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium">授权：{user.username}</div>
        <div className="flex gap-1">
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>保存</Button>
          <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
        </div>
      </div>
      {err && <p className="text-sm text-[var(--color-destructive)]">{err}</p>}
      {grant == null ? (
        <div className="text-sm text-[var(--color-muted-foreground)]">加载中…</div>
      ) : (
        <>
          <div>
            <div className="mb-1 text-xs text-[var(--color-muted-foreground)]">角色（多选）</div>
            <div className="flex flex-wrap gap-1">
              {roles.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => toggle(r.id)}
                  aria-pressed={current.has(r.id)}
                  className={`min-h-9 rounded-md border px-3 py-1 text-xs focus-visible:outline-2 focus-visible:outline-[var(--color-ring)] ${
                    current.has(r.id)
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                      : 'text-[var(--color-muted-foreground)]'
                  }`}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--color-muted-foreground)]">部门</span>
            <select
              className="h-10 min-w-0 max-w-full flex-1 rounded-md border bg-[var(--color-background)] px-2 text-sm sm:flex-none"
              value={deptId ?? ''}
              onChange={(e) => setDeptId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">（无）</option>
              {flattenDept(deptTree).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  )
}

function flattenDept(nodes: ForgeDeptNode[], depth = 0): { id: number; label: string }[] {
  return nodes.flatMap((n) => [
    { id: n.id, label: `${'　'.repeat(depth)}${n.name}` },
    ...flattenDept(n.children, depth + 1),
  ])
}
