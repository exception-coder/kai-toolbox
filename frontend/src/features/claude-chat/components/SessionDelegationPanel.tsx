import { useEffect, useState, type ReactElement } from 'react'
import { Check, Copy, Link2, Loader2, Pause, Play, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { http } from '@/lib/api'
import {
  createSessionDelegation,
  listSessionDelegationAudit,
  listSessionDelegations,
  reissueSessionInvitation,
  revokeSessionDelegation,
  transitionSessionDelegation,
  type SessionDelegationAudit,
  type SessionDelegationView,
} from '../api'

interface UserOption { userId: number; username: string; realName?: string }

export function SessionDelegationPanel({ sessionId }: { sessionId: string }) {
  const [rows, setRows] = useState<SessionDelegationView[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [subjectUserId, setSubjectUserId] = useState('')
  const [profile, setProfile] = useState<'DELEGATED_DEVELOPMENT' | 'REQUEST_ONLY'>('DELEGATED_DEVELOPMENT')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [invitation, setInvitation] = useState<{ code: string; expiresAt: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [audit, setAudit] = useState<{ grantId: string; rows: SessionDelegationAudit[] } | null>(null)

  async function reload() {
    setError('')
    try { setRows(await listSessionDelegations(sessionId)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '加载委托失败') }
  }

  useEffect(() => {
    void reload()
    void http<UserOption[]>('/auth/users/options').then(setUsers).catch(() => setUsers([]))
  }, [sessionId])

  async function create() {
    if (!subjectUserId) { setError('请选择参与者'); return }
    setBusy(true); setError('')
    try {
      const result = await createSessionDelegation(sessionId, {
        subjectUserId: Number(subjectUserId), profile,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        maxTurns: 30, maxInputBytes: 64 * 1024,
      })
      setInvitation({ code: result.invitationCode, expiresAt: result.invitationExpiresAt })
      await reload()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建委托失败') }
    finally { setBusy(false) }
  }

  async function transition(row: SessionDelegationView, action: 'pause' | 'resume' | 'revoke' | 'invite') {
    setBusy(true); setError('')
    try {
      if (action === 'pause' || action === 'resume') {
        await transitionSessionDelegation(sessionId, row.grant.id, action, row.grant.version)
      } else if (action === 'revoke') {
        await revokeSessionDelegation(sessionId, row.grant.id, row.grant.version)
      } else {
        const issued = await reissueSessionInvitation(sessionId, row.grant.id)
        setInvitation({ code: issued.invitationCode, expiresAt: issued.expiresAt })
      }
      await reload()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '委托状态更新失败') }
    finally { setBusy(false) }
  }

  async function showAudit(grantId: string) {
    setError('')
    try { setAudit({ grantId, rows: await listSessionDelegationAudit(sessionId, grantId) }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : '加载审计失败') }
  }

  return (
    <section className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-y-auto px-4 py-6 sm:px-8" aria-labelledby="delegation-title">
      <header className="border-b border-[var(--color-border)] pb-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-[0.14em] text-[var(--color-muted-foreground)]">Session access</p>
            <h2 id="delegation-title" className="text-xl font-semibold tracking-tight">会话委托</h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted-foreground)]">
              将当前会话交给指定业务用户。参与者只能提交需求、回答业务问题和中断自己的回合。
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void reload()} disabled={busy}>
            <RefreshCw className="mr-1.5 size-3.5" />刷新
          </Button>
        </div>
      </header>

      <div className="grid gap-4 border-b border-[var(--color-border)] py-5 md:grid-cols-[minmax(12rem,1fr)_minmax(13rem,1fr)_auto]">
        <label className="grid gap-1.5 text-xs font-medium">
          参与者
          <select value={subjectUserId} onChange={event => setSubjectUserId(event.target.value)}
            className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-sm">
            <option value="">选择 Forge 用户</option>
            {users.map(user => <option key={user.userId} value={user.userId}>{user.realName || user.username}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5 text-xs font-medium">
          能力画像
          <select value={profile} onChange={event => setProfile(event.target.value as typeof profile)}
            className="h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 text-sm">
            <option value="DELEGATED_DEVELOPMENT">受约束开发 · 风险操作由所有者批准</option>
            <option value="REQUEST_ONLY">仅提交与澄清需求</option>
          </select>
        </label>
        <Button className="self-end" onClick={() => void create()} disabled={busy || !subjectUserId}>
          {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Link2 className="mr-1.5 size-4" />}创建邀请
        </Button>
      </div>

      {error && <div role="alert" className="border-b border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error} 请刷新后重试。</div>}
      {invitation && (
        <div className="flex flex-wrap items-center gap-3 border-b border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-950">
          <ShieldCheck className="size-4" />
          <span>单次邀请码</span><code className="select-all font-mono text-xs">{invitation.code}</code>
          <Button variant="outline" size="sm" onClick={async () => {
            try { await navigator.clipboard.writeText(invitation.code); setCopied(true) }
            catch { setError('复制失败，请手动选择邀请码') }
          }}>
            {copied ? <Check className="mr-1 size-3.5" /> : <Copy className="mr-1 size-3.5" />}{copied ? '已复制' : '复制'}
          </Button>
          <span className="ml-auto text-xs text-emerald-800">{new Date(invitation.expiresAt).toLocaleString()} 前有效</span>
        </div>
      )}

      <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[minmax(12rem,1.3fr)_1fr_1fr_8rem_15rem] gap-3 border-b border-[var(--color-border)] px-2 py-2 text-[11px] font-medium uppercase tracking-wider text-[var(--color-muted-foreground)]">
          <span>参与者 / 授权</span><span>画像</span><span>有效期 / 额度</span><span>连接</span><span className="text-right">操作</span>
        </div>
        {rows.length === 0 ? (
          <div className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">当前会话尚未委托。选择参与者后创建一个短时邀请。</div>
        ) : rows.map(row => (
          <div key={row.grant.id} className="grid grid-cols-[minmax(12rem,1.3fr)_1fr_1fr_8rem_15rem] items-center gap-3 border-b border-[var(--color-border)] px-2 py-3 text-sm">
            <div><div className="font-medium">用户 #{row.grant.subjectUserId}</div><div className="mt-0.5 font-mono text-[11px] text-[var(--color-muted-foreground)]">{row.grant.id.slice(0, 12)}</div></div>
            <div><div>{row.grant.profile === 'DELEGATED_DEVELOPMENT' ? '受约束开发' : '仅提需求'}</div><div className="text-xs text-[var(--color-muted-foreground)]">{row.grant.status}</div></div>
            <div><div>{new Date(row.grant.expiresAt).toLocaleString()}</div><div className="text-xs text-[var(--color-muted-foreground)]">{row.grant.usedTurns}/{row.grant.maxTurns} 轮</div></div>
            <div>{row.connectedClients > 0 ? <span className="text-emerald-700">在线 {row.connectedClients}</span> : <span className="text-[var(--color-muted-foreground)]">未连接</span>}</div>
            <div className="flex justify-end gap-1">
              {row.grant.status === 'ACTIVE' && <IconButton label="暂停" onClick={() => void transition(row, 'pause')}><Pause /></IconButton>}
              {row.grant.status === 'PAUSED' && <IconButton label="恢复" onClick={() => void transition(row, 'resume')}><Play /></IconButton>}
              {row.grant.status === 'ACTIVE' && <IconButton label="重发邀请" onClick={() => void transition(row, 'invite')}><RefreshCw /></IconButton>}
              <IconButton label="审计" onClick={() => void showAudit(row.grant.id)}><ShieldCheck /></IconButton>
              {row.grant.status !== 'REVOKED' && <IconButton label="接管并撤销参与者访问" danger onClick={() => void transition(row, 'revoke')}><Trash2 /></IconButton>}
            </div>
          </div>
        ))}
      </div>
      </div>

      {audit && <section className="mt-6 border-t border-[var(--color-border)] pt-4"><h3 className="text-sm font-semibold">最近审计</h3>
        <ol className="mt-2 divide-y divide-[var(--color-border)]">{audit.rows.map(item => <li key={item.id} className="flex gap-4 py-2 text-xs"><time className="w-40 shrink-0 text-[var(--color-muted-foreground)]">{new Date(item.createdAt).toLocaleString()}</time><span className="font-medium">{item.action}</span><span className="text-[var(--color-muted-foreground)]">{item.detail || item.result}</span></li>)}</ol>
      </section>}
    </section>
  )
}

function IconButton({ label, danger, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: ReactElement }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick}
    className={`rounded p-1.5 hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] ${danger ? 'text-red-600' : 'text-[var(--color-muted-foreground)]'}`}>
    <span className="[&>svg]:size-3.5">{children}</span>
  </button>
}
