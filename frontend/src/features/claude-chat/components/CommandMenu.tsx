import { useState } from 'react'

/**
 * 点击 `/` 按钮弹出的命令菜单：顶部 Filter 过滤框 + slash 命令卡片，复刻官方 VSCode 插件的 actions 菜单样式。
 * 命令来自 SDK init（含内置 + ~/.claude/commands 自定义）。选中即把 `/命令 ` 写入输入框。
 */
export function CommandMenu({
  commands,
  onPick,
  onClose,
}: {
  commands: string[]
  onPick: (cmd: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const filtered = commands.filter(c => c.toLowerCase().includes(q.toLowerCase()))

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-full left-0 z-50 mb-2 w-72 overflow-hidden rounded-xl border bg-[var(--color-background)] shadow-xl">
        <div className="border-b p-2">
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="过滤命令…"
            className="w-full rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {commands.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
              暂无可用命令（重启后端、进入会话后由 Ready 下发）
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--color-muted-foreground)]">无匹配命令</div>
          ) : (
            filtered.map(c => (
              <button
                key={c}
                type="button"
                // onMouseDown：避免输入框 blur 抢焦点导致点击落空
                onMouseDown={e => { e.preventDefault(); onPick(c) }}
                className="block w-full px-3 py-2 text-left font-mono text-sm hover:bg-[var(--color-muted)]"
              >
                /{c}
              </button>
            ))
          )}
        </div>
      </div>
    </>
  )
}
