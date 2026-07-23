import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, RotateCcw, Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Permission } from '@/components/auth/Permission'
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
      <div className="flex h-[calc(100dvh-3.5rem)] flex-col items-center justify-center gap-2 text-center text-[var(--color-muted-foreground)]">
        <p className="text-base font-medium">需要管理员权限</p>
        <p className="text-sm">请用具有 ADMIN 角色的账号登录后访问账号管理。</p>
      </div>
    )
  }
  return <AdminPanel />
}

function AdminPanel() {
  const qc = useQueryClient()
  const { data: users = [], isPending } = useQuery({ queryKey: KEY, queryFn: listUsers })
  const { data: forgeRoles = [] } = useQuery({ queryKey: ['forge-roles'], queryFn: fetchForgeRoles })
  const { data: grants = [] } = useQuery({ queryKey: ['forge-user-grants'], queryFn: fetchAllUserGrants })
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY })

  // 账号 → 其 forge 角色名列表（真实权威来源）。
  const roleNameById = new Map(forgeRoles.map(r => [r.id, r.name]))
  const forgeRolesByUser = new Map(
    grants.map(g => [g.userId, g.roleIds.map(id => roleNameById.get(id) ?? `#${id}`)]),
  )

  const [newName, setNewName] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [grantUser, setGrantUser] = useState<AdminUser | null>(null)

  // 新账号默认仅 USER（无任何菜单权限）；建号后由「授权」抽屉分配 Forge 角色/部门。
  const create = useMutation({
    mutationFn: () => createUser(newName.trim(), newPwd, ['USER']),
    onSuccess: () => { setNewName(''); setNewPwd(''); setErr(null); invalidate() },
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

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <h2 className="text-base font-semibold">账号管理</h2>
      {err && <p className="text-sm text-[var(--color-destructive)]">{err}</p>}

      {grantUser && <GrantPanel user={grantUser} onClose={() => setGrantUser(null)} />}

      {/* 新建账号 */}
      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium"><UserPlus className="size-4" /> 新建账号</div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="w-36 rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm" placeholder="用户名" value={newName} onChange={e => setNewName(e.target.value)} />
          <input type="password" className="w-36 rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm" placeholder="密码" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
          <Button size="sm" disabled={!newName.trim() || !newPwd || create.isPending} onClick={() => create.mutate()}>创建</Button>
          <span className="text-xs text-[var(--color-muted-foreground)]">建号后用「授权」分配角色/部门</span>
        </div>
      </div>

      {/* 账号列表 */}
      {isPending ? (
        <div className="text-sm text-[var(--color-muted-foreground)]">加载中…</div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
              <tr><th className="px-3 py-2">用户名</th><th className="px-3 py-2">Forge 角色</th><th className="px-3 py-2 w-20">状态</th><th className="px-3 py-2 w-64">操作</th></tr>
            </thead>
            <tbody className="divide-y">
              {users.map(u => (
                <tr key={u.userId}>
                  <td className="px-3 py-2 font-medium">{u.username}</td>
                  <td className="px-3 py-2"><span className="text-xs">{(forgeRolesByUser.get(u.userId) ?? []).join(', ') || '—'}</span></td>
                  <td className="px-3 py-2 text-xs">{u.enabled ? '启用' : <span className="text-[var(--color-muted-foreground)]">停用</span>}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Permission code="forge:user:btn:assign">
                        <Button size="sm" variant="ghost" title="分配 Forge 角色/部门" onClick={() => setGrantUser(u)}><KeyRound className="size-3.5" /> 授权</Button>
                      </Permission>
                      <Button size="sm" variant="ghost" title="重置密码" onClick={() => void doReset(u)}><RotateCcw className="size-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleEnabled.mutate(u)}>{u.enabled ? '停用' : '启用'}</Button>
                      <Button size="sm" variant="ghost" className="text-[var(--color-destructive)]" title="删除" onClick={() => doDelete(u)}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between">
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
                  className={`rounded-md border px-2 py-0.5 text-xs ${
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
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-muted-foreground)]">部门</span>
            <select
              className="rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm"
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
