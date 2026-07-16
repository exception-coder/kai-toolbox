import { useMemo, useState } from 'react'
import { Check, FileText, RotateCw, Sparkles } from 'lucide-react'
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
  onPickAssistant,
  onPickModel,
  onRefreshModels,
  modelsRefreshing = false,
  onClose,
  inline = false,
}: {
  commands: string[]
  models: ModelInfo[]
  currentModel: string | null
  engine?: Engine
  onPickCommand: (cmd: string) => void
  onPickAssistant?: (prompt: string) => void
  onPickModel: (value: string) => void
  /** 主动同步模型清单（仅 Claude 引擎有意义）：让 sidecar 重新询问 claude 二进制拉最新型号。 */
  onRefreshModels?: () => void
  /** 同步中：刷新图标转圈、按钮禁用。 */
  modelsRefreshing?: boolean
  onClose: () => void
  /** 内嵌模式：相对定位、占满容器宽度、无 fixed 遮罩。用于 overflow-hidden 的窄容器（分屏块 / 悬浮窗），
   *  避免默认的 w-80 绝对下拉被裁切。 */
  inline?: boolean
}) {
  const [q, setQ] = useState('')
  const [platform, setPlatform] = useState<string>('all') // 平台筛选：'all' 或某平台 key
  const ql = q.toLowerCase()
  const fCmds = commands.filter(c => c.toLowerCase().includes(ql))
  const assistants = QUICK_ASSISTANTS.filter(item => item.label.toLowerCase().includes(ql))

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
      {!inline && <div className="fixed inset-0 z-40" onClick={onClose} />}
      <div className={inline
        ? 'relative z-10 mb-1 w-full overflow-hidden rounded-xl border bg-[var(--color-background)] shadow-lg'
        : 'absolute bottom-full left-0 z-50 mb-2 w-80 overflow-hidden rounded-xl border bg-[var(--color-background)] shadow-xl'}>
        <div className="border-b p-2">
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="过滤命令 / 模型…"
              className="min-w-0 flex-1 rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm"
            />
            {/* 主动同步：Claude Code 自更新后，重新询问二进制拉最新模型（如新增 Sonnet 5） */}
            {engine === 'claude' && onRefreshModels && (
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); if (!modelsRefreshing) onRefreshModels() }}
                disabled={modelsRefreshing}
                title="同步模型清单（重新询问 Claude，用于官方更新后拉到最新型号）"
                aria-label="同步模型清单"
                className="flex size-7 shrink-0 items-center justify-center rounded-md border text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] disabled:opacity-50"
              >
                <RotateCw className={`size-3.5 ${modelsRefreshing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
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
          {onPickAssistant && assistants.length > 0 && (
            <div>
              <div className="px-3 py-1 text-xs font-medium text-[var(--color-muted-foreground)]">快捷助手</div>
              {assistants.map(item => {
                const Icon = item.icon
                return (
                  <button
                    key={item.label}
                    type="button"
                    onMouseDown={event => { event.preventDefault(); onPickAssistant(item.prompt) }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-muted)]"
                  >
                    <Icon className="size-5 shrink-0" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                )
              })}
            </div>
          )}
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
          {fModelCount === 0 && fCmds.length === 0 && (!onPickAssistant || assistants.length === 0) && (
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

const QUICK_ASSISTANTS = [
  {
    label: 'Requirements',
    icon: Sparkles,
    prompt: '请进入 Requirements 模式：先梳理需求目标、目标用户、使用场景、范围边界、约束、验收标准和未决问题。在关键需求确认前先向我提问，不要直接开始编码。',
  },
  {
    label: 'PRD 澄清助手',
    icon: FileText,
    prompt: '请作为 PRD 澄清助手审阅当前需求。识别目标、用户流程、业务规则、异常场景、数据与权限、非功能要求、验收标准中的缺口，并按优先级逐项向我提问，最后输出一份可执行的需求澄清结论。',
  },
] as const

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
