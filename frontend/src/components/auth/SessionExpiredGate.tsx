import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { onSessionExpired } from '@/lib/auth'
import { LoginDialog } from './LoginDialog'

/**
 * 全局「会话失效」守卫：订阅 auth 的会话失效事件（refresh 失败 / HTTP 401 / WS 握手反复被拒），
 * 一旦触发就主动弹登录框——不管用户当前在哪个页面 / 悬浮窗，避免只在某个面板里静默报错、
 * 或后台无限重连刷屏却无任何提示。登录成功后清空 query 缓存触发全量重取。
 *
 * 只挂一份（App 根），与 ConfirmProvider/PromptProvider 同级常驻。
 */
export function SessionExpiredGate() {
  const [open, setOpen] = useState(false)
  const qc = useQueryClient()

  // 各 emit 站点都已是「确凿的鉴权失败」（refresh 失败 / HTTP 401 且本地有 token / WS 反复握手被拒），
  // 故收到即弹；重复 emit 由 setOpen 幂等吸收。
  useEffect(() => onSessionExpired(() => setOpen(true)), [])

  return (
    <LoginDialog
      open={open}
      message="登录凭证已过期或失效，请重新登录以继续。"
      onClose={() => setOpen(false)}
      onSuccess={() => { setOpen(false); qc.clear() }}
    />
  )
}
