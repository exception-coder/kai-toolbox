import { useEffect, useState } from 'react'

/** 授权目录变更仍走原有会话复制与确认流程。 */
export function CodexAuthDirectory({ current, homes, loading, disabled, onChange }: {
  current?: string | null
  homes: string[]
  loading?: boolean
  disabled?: boolean
  onChange: (home: string) => void
}) {
  const [pending, setPending] = useState<string | null>(null)
  useEffect(() => {
    setPending(value => value && value !== current && homes.includes(value) ? value : null)
  }, [current, homes])
  const value = current?.trim() || ''
  return <div className="space-y-2">
    <label htmlFor="session-auth-directory" className="text-sm font-medium">Auth 目录</label>
    <select id="session-auth-directory" value={value} disabled={disabled || loading || !homes.length}
      onChange={event => { if (event.target.value && event.target.value !== value) setPending(event.target.value) }}
      className="h-11 w-full rounded-md border bg-[var(--color-background)] px-2 text-sm disabled:opacity-50 md:h-9 md:text-xs">
      {!value && <option value="">默认目录（%USERPROFILE%\.codex）</option>}
      {value && !homes.includes(value) && <option value={value}>{value}</option>}
      {homes.map(home => <option key={home} value={home}>{home}</option>)}
    </select>
    {loading && <p className="text-xs text-[var(--color-muted-foreground)]">正在读取授权目录…</p>}
    {pending && <div role="status" className="space-y-2 rounded-md border p-2 text-xs">
      <p>将使用新的授权目录创建会话，当前会话保持不变。</p>
      <p className="break-all">{pending}</p>
      <div className="flex gap-3">
        <button type="button" disabled={disabled || loading} className="font-medium text-[var(--color-primary)] disabled:opacity-50" onClick={() => { onChange(pending); setPending(null) }}>创建并切换</button>
        <button type="button" onClick={() => setPending(null)}>取消</button>
      </div>
    </div>}
  </div>
}
