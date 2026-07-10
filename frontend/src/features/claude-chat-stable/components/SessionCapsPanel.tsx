import { Boxes, Bot, Server, Slash, Sparkles, X } from 'lucide-react'
import type { Engine } from '../types'

interface Props {
  skills: string[]
  agents: string[]
  mcpServers: { name: string; status: string }[]
  outputStyle: string | null
  slashCount: number
  engine: Engine
  onClose: () => void
}

/** 会话能力面板：展示 SDK init 返回的激活技能 / 子代理 / MCP 服务 / 输出风格。仅 Claude 引擎有数据。 */
export function SessionCapsPanel({ skills, agents, mcpServers, outputStyle, slashCount, engine, onClose }: Props) {
  const isClaude = engine === 'claude'
  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-3">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-4 text-[var(--color-primary)]" />
        <span className="text-sm font-semibold">会话能力</span>
        <span className="text-[11px] text-[var(--color-muted-foreground)]">来自 SDK 初始化</span>
        <button type="button" onClick={onClose} aria-label="关闭" className="ml-auto rounded p-1 hover:bg-[var(--color-accent)]">
          <X className="size-4" />
        </button>
      </div>

      {!isClaude ? (
        <p className="text-xs text-[var(--color-muted-foreground)]">当前为 {engine} 引擎，能力清单仅 Claude 会话提供。</p>
      ) : (
        <div className="flex flex-col gap-3">
          <CapGroup icon={<Sparkles className="size-3.5" />} title="技能 Skills" items={skills} empty="无激活技能" />
          <CapGroup icon={<Bot className="size-3.5" />} title="子代理 Subagents" items={agents} empty="无可用子代理" />
          <CapGroup
            icon={<Server className="size-3.5" />}
            title="MCP 服务"
            items={mcpServers.map(s => `${s.name}${s.status && s.status !== 'connected' ? `（${s.status}）` : ''}`)}
            empty="无 MCP 服务"
            tone={mcpServers}
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-muted-foreground)]">
            <span className="inline-flex items-center gap-1"><Slash className="size-3.5" />{slashCount} 条命令</span>
            {outputStyle && <span className="inline-flex items-center gap-1"><Boxes className="size-3.5" />输出风格：{outputStyle}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

function CapGroup({ icon, title, items, empty, tone }: {
  icon: React.ReactNode
  title: string
  items: string[]
  empty: string
  tone?: { name: string; status: string }[]
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[var(--color-foreground)]">
        {icon}{title}
        <span className="text-[var(--color-muted-foreground)]">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-[var(--color-muted-foreground)]">{empty}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it, i) => {
            const bad = tone && tone[i] && tone[i].status && tone[i].status !== 'connected'
            return (
              <span
                key={it + i}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${bad
                  ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300'
                  : 'border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)]'}`}
              >
                {it}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
