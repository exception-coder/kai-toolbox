import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const TOKEN_KEY = 'kai-toolbox:supervisor-token'

/**
 * 一键重启后端的应用内弹层（移动端 window.prompt 不可用，必须用页面内输入框收 token）。
 * 依次尝试「后端自重启」与「守护进程重启」两个端点；成功后连接短暂断开，前端自动重连续上会话。
 * 自包含 token/状态，供全屏会话页与悬浮窗共用。
 */
export function RestartDialog({ onClose }: { onClose: () => void }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) ?? '')
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const doRestart = async () => {
    const t = token.trim()
    if (!t) { setStatus('请先输入 RestartToken'); return }
    localStorage.setItem(TOKEN_KEY, t)
    setBusy(true)
    setStatus('正在请求重启…')
    // 带超时的 POST：通道不可达/无响应时 8s 中断，避免无限卡住。
    const tryRestart = async (path: string): Promise<Response> => {
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), 8000)
      try {
        return await fetch(path, { method: 'POST', headers: { 'X-Restart-Token': t }, signal: ac.signal })
      } finally {
        clearTimeout(timer)
      }
    }
    const attempts = [
      { label: '后端自重启(/api/system/restart)', path: '/api/system/restart' },
      { label: '守护进程(/supervisor/restart)', path: '/supervisor/restart' },
    ]
    const notes: string[] = []
    for (const a of attempts) {
      try {
        const r = await tryRestart(a.path)
        if (r.ok) {
          setStatus('✅ 重启已触发，后端数秒后回来，页面会自动重连。')
          setBusy(false)
          return
        }
        if (r.status === 403) notes.push(`${a.label}：token 不匹配`)
        else if (r.status === 503) notes.push(`${a.label}：未启用/未配置 token`)
        else if (r.status === 404 || r.status === 405) notes.push(`${a.label}：端点不可达`)
        else notes.push(`${a.label}：HTTP ${r.status}`)
      } catch (e) {
        notes.push(`${a.label}：${(e as Error)?.name === 'AbortError' ? '超时无响应' : '连不上'}`)
      }
    }
    // 两条都因 token 不匹配失败：清掉本地 token 让用户重填
    if (notes.length > 0 && notes.every(n => n.includes('token 不匹配'))) {
      localStorage.removeItem(TOKEN_KEY)
    }
    setStatus('❌ 重启失败：\n' + notes.join('\n')
      + '\n（请确认后端用 run-supervised.ps1 启动，且 run-tools.conf 配了 RestartToken）')
    setBusy(false)
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
      onClick={() => { if (!busy) onClose() }}
    >
      <div
        className="w-full max-w-sm rounded-lg border bg-[var(--color-background)] p-4 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-medium">重启后端服务</h3>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
          当前连接会短暂断开，重启后页面自动重连续上会话。输入 RestartToken（run-tools.conf 里的 TOOLBOX_SYSTEM_RESTART_TOKEN 或 TOOLBOX_SUPERVISOR_RESTART_TOKEN）。
        </p>
        <Input
          type="password"
          autoFocus
          className="mt-3"
          placeholder="RestartToken"
          value={token}
          onChange={e => setToken(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !busy) doRestart() }}
        />
        {status && <p className="mt-2 whitespace-pre-line text-xs">{status}</p>}
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>取消</Button>
          <Button size="sm" disabled={busy} onClick={doRestart}>{busy ? '请求中…' : '重启'}</Button>
        </div>
      </div>
    </div>
  )
}
