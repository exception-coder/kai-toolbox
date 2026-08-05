import { Boxes, Bot, RefreshCw, Server, Slash, Sparkles, X } from 'lucide-react'
import type { Engine } from '../types'

interface Props {
  skills: string[]
  agents: string[]
  mcpServers: { name: string; status: string }[]
  outputStyle: string | null
  slashCount: number
  engine: Engine
  refreshing: boolean
  onRefresh: () => void
  onClose: () => void
}

/** 会话能力面板：Claude 展示完整 SDK init 信息，Codex 展示平台运行时注入的 MCP。 */
export function SessionCapsPanel({ skills, agents, mcpServers, outputStyle, slashCount, engine, refreshing, onRefresh, onClose }: Props) {
  const isClaude = engine === 'claude'
  const isCodex = engine === 'codex'
  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-3">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-4 text-[var(--color-primary)]" />
        <span className="text-sm font-semibold">会话能力</span>
        <span className="text-[11px] text-[var(--color-muted-foreground)]">
          {isCodex ? '来自 sidecar 运行时配置' : '来自 SDK 初始化'}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="刷新会话能力"
          title="刷新会话能力"
          className="ml-auto rounded p-1 hover:bg-[var(--color-accent)] disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        <button type="button" onClick={onClose} aria-label="关闭" className="rounded p-1 hover:bg-[var(--color-accent)]">
          <X className="size-4" />
        </button>
      </div>

      {!isClaude && !isCodex ? (
        <p className="text-xs text-[var(--color-muted-foreground)]">当前为 {engine} 引擎，暂未提供能力清单。</p>
      ) : isCodex ? (
        <div className="flex flex-col gap-2">
          <CapGroup
            icon={<Server className="size-3.5" />}
            title="MCP 服务"
            items={mcpServers.map(s => `${s.name}${s.status && s.status !== 'connected' ? `（${s.status}）` : ''}`)}
            empty="未检测到 MCP；请刷新，若仍为空请重启 kai-toolbox 后端/sidecar"
            tone={mcpServers}
          />
          <p className="text-[11px] text-[var(--color-muted-foreground)]">
            当前 Codex SDK 不返回 Skills / Subagents 初始化清单，此处展示 kai-toolbox 运行时注入的 MCP。
          </p>
        </div>
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
            const status = tone?.[i]?.status
            const bad = status === 'failed' || status === 'error' || status === 'disconnected'
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
