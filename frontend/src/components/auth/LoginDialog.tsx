import { useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
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

/**
 * 轻量登录弹窗：调用 /api/auth/login，成功后存 token 并回调。
 *
 * 必须走 Radix Portal 挂到 body：本组件由 AccountMenu 渲染，而 AccountMenu 在移动端位于
 * SheetContent（侧边抽屉）内部。抽屉带 transition-transform + translate-x-*，会成为
 * containing block，使内部的 fixed inset-0 退化为「相对抽屉」定位——表现就是登录卡片
 * 居中在侧边栏里而不是屏幕中央，还被抽屉的 w-60/max-w-[80vw] 裁切。
 */
export function LoginDialog({ open, onClose, onSuccess, message }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
    <DialogPrimitive.Root open={open} onOpenChange={next => { if (!next) onClose() }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            'fixed inset-0 z-[60] bg-black/50 transition-opacity duration-150',
            'data-[state=closed]:opacity-0 data-[state=open]:opacity-100',
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            // 小屏留边距按 viewport 收窄，大屏回到定宽卡片；键盘顶起时可滚
            'fixed left-1/2 top-1/2 z-[60] w-[min(92vw,22rem)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto',
            'rounded-xl border bg-[var(--color-background)] p-6 shadow-xl',
            'transition-all duration-150 focus:outline-none',
            'data-[state=closed]:scale-95 data-[state=closed]:opacity-0',
            'data-[state=open]:scale-100 data-[state=open]:opacity-100',
          )}
        >
          {/* 品牌头：强化第一印象——大号 logo + Forge + slogan */}
          <div className="mb-5 flex flex-col items-center gap-2 text-center">
            <BrandLogo className="h-11 w-11" />
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight">
                {BRAND_DEFAULTS.appName}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                {BRAND_DEFAULTS.tagline}
              </DialogPrimitive.Description>
            </div>
          </div>
          {message && <p className="mb-3 text-center text-xs text-[var(--color-muted-foreground)]">{message}</p>}
          <input
            autoFocus
            autoComplete="username"
            className="mb-2 w-full rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm"
            placeholder="用户名"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
          <input
            type="password"
            autoComplete="current-password"
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
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
