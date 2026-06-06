import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Pencil, RotateCcw, Trash2, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { COMMON_ROLES, createUser, deleteUser, listUsers, resetPassword, setEnabled, updateRoles, type AdminUser } from '../api'

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
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY })

  const [newName, setNewName] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [newRoles, setNewRoles] = useState<string[]>(['USER'])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editRoles, setEditRoles] = useState<string[]>([])
  const [err, setErr] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: () => createUser(newName.trim(), newPwd, newRoles),
    onSuccess: () => { setNewName(''); setNewPwd(''); setNewRoles(['USER']); setErr(null); invalidate() },
    onError: e => setErr((e as Error).message),
  })
  const saveRoles = useMutation({
    mutationFn: (id: number) => updateRoles(id, editRoles),
    onSuccess: () => { setEditingId(null); invalidate() },
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
  const startEdit = (u: AdminUser) => { setEditingId(u.userId); setEditRoles(u.roles) }
  const toggleRole = (roles: string[], r: string, set: (v: string[]) => void) =>
    set(roles.includes(r) ? roles.filter(x => x !== r) : [...roles, r])

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <h2 className="text-base font-semibold">账号管理</h2>
      {err && <p className="text-sm text-[var(--color-destructive)]">{err}</p>}

      {/* 新建账号 */}
      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium"><UserPlus className="size-4" /> 新建账号</div>
        <div className="flex flex-wrap items-center gap-2">
          <input className="w-36 rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm" placeholder="用户名" value={newName} onChange={e => setNewName(e.target.value)} />
          <input type="password" className="w-36 rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm" placeholder="密码" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
          <RolePicker roles={newRoles} onToggle={r => toggleRole(newRoles, r, setNewRoles)} />
          <Button size="sm" disabled={!newName.trim() || !newPwd || create.isPending} onClick={() => create.mutate()}>创建</Button>
        </div>
      </div>

      {/* 账号列表 */}
      {isPending ? (
        <div className="text-sm text-[var(--color-muted-foreground)]">加载中…</div>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-muted)] text-left text-xs text-[var(--color-muted-foreground)]">
              <tr><th className="px-3 py-2">用户名</th><th className="px-3 py-2">角色</th><th className="px-3 py-2 w-20">状态</th><th className="px-3 py-2 w-64">操作</th></tr>
            </thead>
            <tbody className="divide-y">
              {users.map(u => (
                <tr key={u.userId}>
                  <td className="px-3 py-2 font-medium">{u.username}</td>
                  <td className="px-3 py-2">
                    {editingId === u.userId
                      ? <RolePicker roles={editRoles} onToggle={r => toggleRole(editRoles, r, setEditRoles)} />
                      : <span className="text-xs">{u.roles.join(', ') || '—'}</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{u.enabled ? '启用' : <span className="text-[var(--color-muted-foreground)]">停用</span>}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {editingId === u.userId ? (
                        <>
                          <Button size="sm" variant="outline" onClick={() => saveRoles.mutate(u.userId)}><Check className="size-3.5" /> 保存</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>取消</Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" title="改角色" onClick={() => startEdit(u)}><Pencil className="size-3.5" /></Button>
                          <Button size="sm" variant="ghost" title="重置密码" onClick={() => void doReset(u)}><RotateCcw className="size-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => toggleEnabled.mutate(u)}>{u.enabled ? '停用' : '启用'}</Button>
                          <Button size="sm" variant="ghost" className="text-[var(--color-destructive)]" title="删除" onClick={() => doDelete(u)}><Trash2 className="size-3.5" /></Button>
                        </>
                      )}
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

function RolePicker({ roles, onToggle }: { roles: string[]; onToggle: (r: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {COMMON_ROLES.map(r => (
        <button
          key={r}
          type="button"
          onClick={() => onToggle(r)}
          className={`rounded-md border px-2 py-0.5 text-xs ${roles.includes(r) ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]' : 'text-[var(--color-muted-foreground)]'}`}
        >
          {r}
        </button>
      ))}
    </div>
  )
}
