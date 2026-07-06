import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { login } from '@/lib/auth'

interface Props {
  open: boolean
  onClose: () => void
  onSuccess?: () => void
  /** 可选提示语，显示在标题下方（如「登录已过期，请重新登录」）。 */
  message?: string
}

/** 轻量登录弹窗：调用 /api/auth/login，成功后存 token 并回调。 */
export function LoginDialog({ open, onClose, onSuccess, message }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  const submit = async () => {
    setBusy(true)
    setErr(null)
    try {
      await login(username, password)
      onSuccess?.()
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-80 rounded-lg border bg-[var(--color-background)] p-4 shadow-lg"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="mb-1 text-base font-semibold">登录</h3>
        {message && <p className="mb-3 text-xs text-[var(--color-muted-foreground)]">{message}</p>}
        {!message && <div className="mb-2" />}
        <input
          autoFocus
          className="mb-2 w-full rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm"
          placeholder="用户名"
          value={username}
          onChange={e => setUsername(e.target.value)}
        />
        <input
          type="password"
          className="mb-2 w-full rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm"
          placeholder="密码"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void submit() }}
        />
        {err && <p className="mb-2 text-xs text-[var(--color-destructive)]">{err}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>取消</Button>
          <Button size="sm" onClick={() => void submit()} disabled={busy || !username || !password}>
            登录
          </Button>
        </div>
      </div>
    </div>
  )
}
