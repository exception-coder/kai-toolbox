import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import type { Engine, ModelInfo } from '../types'
import { groupModels } from './modelGroups'

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
  const [platform, setPlatform] = useState<string>('all') // 平台筛选：'all' 或某平台 key
  const ql = q.toLowerCase()
  const fCmds = commands.filter(c => c.toLowerCase().includes(ql))

  // 先文本过滤，再按平台分组；模型多时用平台二级筛选收窄（网关动辄上百个，平铺难选）
  const textModels = models.filter(m => m.displayName.toLowerCase().includes(ql) || m.value.toLowerCase().includes(ql))
  const groups = useMemo(() => groupModels(textModels), [textModels])
  const platforms = groups.map(g => ({ key: g.key, label: g.label, count: g.models.length }))
  const shownGroups = platform === 'all' ? groups : groups.filter(g => g.key === platform)
  const fModelCount = shownGroups.reduce((n, g) => n + g.models.length, 0)
  // 平台筛选条仅在「有多个平台」时才显示，避免单平台时多此一举
  const showPlatformBar = platforms.length > 1

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
          {/* 平台筛选（二级）：模型按平台分组，点平台只看该平台下的型号，收窄长清单 */}
          {showPlatformBar && (
            <div className="mt-2 flex flex-wrap gap-1">
              <PlatformChip active={platform === 'all'} onClick={() => setPlatform('all')}>
                全部 {fModelCount}
              </PlatformChip>
              {platforms.map(p => (
                <PlatformChip key={p.key} active={platform === p.key} onClick={() => setPlatform(p.key)}>
                  {p.label} {p.count}
                </PlatformChip>
              ))}
            </div>
          )}
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {shownGroups.map(g => (
            <div key={g.key}>
              <div className="px-3 py-1 text-xs font-medium text-[var(--color-muted-foreground)]">{g.label}（{g.models.length}）</div>
              {g.models.map(m => (
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
            </div>
          ))}
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
          {fModelCount === 0 && fCmds.length === 0 && (
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

/** 平台筛选小胶囊。 */
function PlatformChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className={'rounded-full border px-2 py-0.5 text-[11px] ' + (active
        ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
        : 'bg-[var(--color-background)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]')}
    >
      {children}
    </button>
  )
}
