import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { login } from '@/lib/auth'
import { BrandLogo } from '@/shell/BrandLogo'
import { BRAND_DEFAULTS } from '@/shell/brand'

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
        className="w-[22rem] rounded-xl border bg-[var(--color-background)] p-6 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        {/* 品牌头：强化第一印象——大号 logo + Forge + slogan */}
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <BrandLogo className="h-11 w-11" />
          <div>
            <div className="text-lg font-semibold tracking-tight">{BRAND_DEFAULTS.appName}</div>
            <div className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{BRAND_DEFAULTS.tagline}</div>
          </div>
        </div>
        {message && <p className="mb-3 text-center text-xs text-[var(--color-muted-foreground)]">{message}</p>}
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
