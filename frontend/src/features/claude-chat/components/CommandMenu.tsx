import { useState } from 'react'
import { Check } from 'lucide-react'
import type { Engine, ModelInfo } from '../types'

/**
 * `/` 按钮弹出的分组菜单（复刻官方 VSCode 插件 actions 菜单）：顶部 Filter 同时过滤两组——
 * 「模型」组（来自 SDK supportedModels，点击切换，当前项打勾）+「命令」组（SDK slash 命令，选中插入 `/命令 `）。
 */
export function CommandMenu({
  commands,
  models,
  currentModel,
  engine = 'claude',
  onPickCommand,
  onPickModel,
  onClose,
}: {
  commands: string[]
  models: ModelInfo[]
  currentModel: string | null
  engine?: Engine
  onPickCommand: (cmd: string) => void
  onPickModel: (value: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const ql = q.toLowerCase()
  const fModels = models.filter(m => m.displayName.toLowerCase().includes(ql) || m.value.toLowerCase().includes(ql))
  const fCmds = commands.filter(c => c.toLowerCase().includes(ql))

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute bottom-full left-0 z-50 mb-2 w-80 overflow-hidden rounded-xl border bg-[var(--color-background)] shadow-xl">
        <div className="border-b p-2">
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="过滤命令 / 模型…"
            className="w-full rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm"
          />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {fModels.length > 0 && (
            <>
              <div className="px-3 py-1 text-xs font-medium text-[var(--color-muted-foreground)]">模型</div>
              {fModels.map(m => (
                <button
                  key={m.value}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); onPickModel(m.value) }}
                  className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[var(--color-muted)]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">{m.displayName}</span>
                    {m.description && (
                      <span className="block truncate text-xs text-[var(--color-muted-foreground)]">{m.description}</span>
                    )}
                  </span>
                  {m.value === currentModel && <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-primary)]" />}
                </button>
              ))}
            </>
          )}
          {fCmds.length > 0 && (
            <>
              <div className="px-3 py-1 text-xs font-medium text-[var(--color-muted-foreground)]">命令</div>
              {fCmds.map(c => (
                <button
                  key={c}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); onPickCommand(c) }}
                  className="block w-full px-3 py-2 text-left font-mono text-sm hover:bg-[var(--color-muted)]"
                >
                  /{c}
                </button>
              ))}
            </>
          )}
          {fModels.length === 0 && fCmds.length === 0 && (
            <div className="px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
              {models.length === 0 && commands.length === 0
                ? (engine === 'codex'
                    ? 'Codex 会话：模型由 ~/.codex 配置决定，此处不提供模型/命令切换'
                    : '暂无可用项（首轮对话后由后端下发命令/模型）')
                : '无匹配项'}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
