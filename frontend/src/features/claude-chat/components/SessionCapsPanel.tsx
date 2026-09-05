import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertTriangle, Bot, Boxes, ChevronRight, CircleCheck, CircleDashed, Package,
  PlugZap, RefreshCw, Server, Slash, Sparkles, Wrench, X,
} from 'lucide-react'
import type {
  CapabilityProvenance, CapabilitySnapshotSource, Engine, McpCapability, PluginCapability,
  SkillCapability,
} from '../types'

interface Props {
  skills: string[]
  skillDetails: SkillCapability[]
  plugins: PluginCapability[]
  agents: string[]
  mcpServers: McpCapability[]
  outputStyle: string | null
  slashCount: number
  engine: Engine
  capabilitySource: CapabilitySnapshotSource
  capabilityRefreshedAt: number | null
  capabilityErrors: string[]
  refreshing: boolean
  onRefresh: () => void
  onClose: () => void
}

const MCP_STATUS: Record<string, string> = {
  connected: '已连接', starting: '连接中', notStarted: '未启动',
  authenticationRequired: '需要认证', failed: '连接失败', cancelled: '已取消',
  disabled: '已禁用', configured: '仅配置', unavailable: '不可用',
  disconnected: '已断开', error: '异常',
}

const ORIGIN_LABEL: Record<CapabilityProvenance['origin'], string> = {
  'forge-session': 'Forge 会话注入',
  'engine-auth-global': 'Auth 全局配置',
  plugin: 'Plugin 贡献',
  'project-local': '项目本地',
  'engine-builtin': '引擎内建',
  unknown: '来源未确认',
}

const SCOPE_LABEL: Record<CapabilityProvenance['scope'], string> = {
  session: '当前会话',
  project: '当前项目',
  'auth-directory': 'Auth 目录',
  engine: '引擎',
  plugin: '插件',
  unknown: '未知范围',
}

function sourceLabel(source: CapabilitySnapshotSource): string {
  switch (source) {
    case 'codex-app-server': return 'Codex App Server · 运行时目录'
    case 'claude-sdk': return 'Claude SDK · 初始化快照'
    case 'sidecar-config': return 'Sidecar 配置 · 尚未运行时核验'
    default: return '能力来源待确认'
  }
}

function formatRefreshTime(value: number | null): string {
  if (!value) return '尚未刷新'
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(value)
}

/** 当前会话真实能力目录；树节点只展示诊断事实，不在这里修改插件或 MCP 配置。 */
export function SessionCapsPanel(props: Props) {
  const {
    skills, skillDetails, plugins, agents, mcpServers, outputStyle, slashCount, engine,
    capabilitySource, capabilityRefreshedAt, capabilityErrors, refreshing, onRefresh, onClose,
  } = props
  const skillByPlugin = useMemo(() => {
    const grouped = new Map<string, SkillCapability[]>()
    for (const skill of skillDetails) {
      if (!skill.pluginId) continue
      grouped.set(skill.pluginId, [...(grouped.get(skill.pluginId) ?? []), skill])
    }
    return grouped
  }, [skillDetails])
  const standaloneSkills = skillDetails.filter(skill => !skill.pluginId)
  const toolCount = mcpServers.reduce((total, server) => total + (server.tools?.length ?? 0), 0)
  const unverifiedCount = mcpServers.filter(server => !server.verified || !server.toolInventoryComplete).length
  const updateCount = plugins.filter(plugin => plugin.updateAvailable).length
  const remoteUnknownCount = plugins.filter(plugin => plugin.localVersion && !plugin.remoteVersion).length
  const legacySkills = skillDetails.length === 0 ? skills : []

  return (
    <section className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/25" aria-label="当前会话能力">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 items-start gap-2">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-[var(--color-primary)]" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h2 className="text-sm font-semibold text-[var(--color-foreground)]">会话能力</h2>
              <span className="text-[11px] text-[var(--color-muted-foreground)]">{sourceLabel(capabilitySource)}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">
              {mcpServers.length} 个 MCP · {toolCount} 个 Tool · {plugins.length} 个 Plugin · {skillDetails.length || skills.length} 个 Skill
              {unverifiedCount > 0 && ` · ${unverifiedCount} 个 Tool 清单未核验`}
              {updateCount > 0 && ` · ${updateCount} 个 Plugin 可更新`}
              {remoteUnknownCount > 0 && ` · ${remoteUnknownCount} 个 Plugin 远端版本未知`}
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="hidden text-[11px] text-[var(--color-muted-foreground)] sm:inline">更新于 {formatRefreshTime(capabilityRefreshedAt)}</span>
          <button type="button" onClick={onRefresh} disabled={refreshing} aria-label="刷新会话能力"
            title="使用当前 Auth 目录和工作目录重新核验"
            className="rounded-md p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50">
            <RefreshCw className={`size-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={onClose} aria-label="关闭会话能力"
            className="rounded-md p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
            <X className="size-4" />
          </button>
        </div>
      </div>

      {capabilityErrors.length > 0 && (
        <div className="mx-4 mb-3 flex gap-2 border-l-2 border-amber-500 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" role="status">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <div>
            <p className="font-medium">部分能力未完成核验</p>
            {capabilityErrors.map(error => <p key={error} className="mt-0.5 break-words text-[11px] opacity-90">{error}</p>)}
          </div>
        </div>
      )}

      <div className="scrollbar-autohide grid max-h-[52vh] grid-cols-1 overflow-y-auto border-t border-[var(--color-border)] lg:grid-cols-2 lg:divide-x lg:divide-[var(--color-border)]">
        <CapabilitySection icon={<Server className="size-4" />} title="MCP 与 Tools" count={mcpServers.length}>
          {mcpServers.length === 0 ? (
            <EmptyLine text={engine === 'codex' ? '当前会话未检测到 MCP。刷新后仍为空时，请检查 Sidecar 与 Auth 目录。' : '当前 SDK 未返回 MCP 服务。'} />
          ) : mcpServers.map(server => <McpNode key={server.name} server={server} />)}
        </CapabilitySection>

        <div className="border-t border-[var(--color-border)] lg:border-t-0">
          <CapabilitySection icon={<Package className="size-4" />} title="Plugins 与 Skills" count={plugins.length}>
            {plugins.map(plugin => <PluginNode key={plugin.id} plugin={plugin} skills={skillByPlugin.get(plugin.id) ?? []} />)}
            {standaloneSkills.length > 0 && <SkillGroup title="独立 Skills" subtitle="不属于 Plugin" skills={standaloneSkills} defaultOpen />}
            {legacySkills.length > 0 && (
              <SkillGroup title="SDK Skills" subtitle="当前引擎未返回 Plugin 归属"
                skills={legacySkills.map(name => ({ name, description: '', enabled: true, scope: 'unknown', toolDependencies: [] }))} />
            )}
            {plugins.length === 0 && standaloneSkills.length === 0 && legacySkills.length === 0 && (
              <EmptyLine text={engine === 'codex' ? '尚未取得 Plugin / Skill 目录。点击刷新进行核验。' : '当前 SDK 未返回 Skills。'} />
            )}
          </CapabilitySection>

          {(agents.length > 0 || slashCount > 0 || outputStyle) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[var(--color-border)] px-4 py-2.5 text-[11px] text-[var(--color-muted-foreground)]">
              {agents.length > 0 && <span className="inline-flex items-center gap-1"><Bot className="size-3.5" />{agents.length} 个子代理</span>}
              {slashCount > 0 && <span className="inline-flex items-center gap-1"><Slash className="size-3.5" />{slashCount} 条命令</span>}
              {outputStyle && <span className="inline-flex items-center gap-1"><Boxes className="size-3.5" />输出风格：{outputStyle}</span>}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function CapabilitySection({ icon, title, count, children }: { icon: ReactNode; title: string; count: number; children: ReactNode }) {
  return (
    <div>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-background)]/95 px-4 py-2 text-xs font-medium backdrop-blur-sm">
        {icon}<span>{title}</span><span className="font-normal text-[var(--color-muted-foreground)]">{count}</span>
      </div>
      <div className="divide-y divide-[var(--color-border)]">{children}</div>
    </div>
  )
}

function McpNode({ server }: { server: McpCapability }) {
  const tools = server.tools ?? []
  const status = server.runtimeStatus || server.status
  const healthy = server.verified && status === 'connected'
  const needsAttention = !healthy || !server.toolInventoryComplete
  const [open, setOpen] = useState(needsAttention)
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left hover:bg-[var(--color-accent)]/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)]">
        <ChevronRight className={`size-3.5 shrink-0 text-[var(--color-muted-foreground)] transition-transform ${open ? 'rotate-90' : ''}`} />
        {healthy ? <CircleCheck className="size-3.5 shrink-0 text-emerald-600" /> : <CircleDashed className="size-3.5 shrink-0 text-amber-600" />}
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={server.name}>{server.serverTitle || server.name}</span>
        <span className="shrink-0 text-[11px] text-[var(--color-muted-foreground)]">{MCP_STATUS[status] || status || '未知'}</span>
        <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
          {server.toolInventoryComplete ? `${tools.length} Tools` : '未核验'}
        </span>
      </button>
      {open && <div className="pb-2 pl-12 pr-4">
        <div className="mb-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--color-muted-foreground)]">
          {server.serverVersion && <span>服务版本 {server.serverVersion}</span>}
          {server.authStatus && <span>认证 {server.authStatus}</span>}
          {server.pluginId && <span>Plugin {server.pluginId}</span>}
        </div>
        <ProvenanceLine provenance={server.provenance} />
        {!server.toolInventoryComplete ? (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">当前只确认了配置或连接状态，不能证明 Tool 已注入。</p>
        ) : tools.length === 0 ? (
          <p className="text-[11px] text-[var(--color-muted-foreground)]">运行时未暴露 Tool。</p>
        ) : (
          <ul className="space-y-1" aria-label={`${server.name} Tools`}>
            {tools.map(tool => (
              <li key={tool.name} className="flex min-w-0 items-start gap-1.5 text-[11px]">
                <Wrench className="mt-0.5 size-3 shrink-0 text-[var(--color-muted-foreground)]" />
                <span className="break-all font-mono text-[var(--color-foreground)]" title={tool.description || undefined}>{tool.name}</span>
                <ProvenanceInline provenance={tool.provenance} />
                {tool.description && <span className="hidden min-w-0 truncate text-[var(--color-muted-foreground)] xl:block">— {tool.description}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>}
    </div>
  )
}

function PluginNode({ plugin, skills }: { plugin: PluginCapability; skills: SkillCapability[] }) {
  const remoteUnknown = Boolean(plugin.localVersion && !plugin.remoteVersion)
  const status = plugin.updateAvailable
    ? '可更新'
    : remoteUnknown
      ? '远端版本未知'
      : plugin.localVersion && plugin.remoteVersion
        ? '已是最新'
        : plugin.enabled ? '已启用' : '未启用'
  const [open, setOpen] = useState(plugin.updateAvailable || remoteUnknown)
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left hover:bg-[var(--color-accent)]/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)]">
        <ChevronRight className={`size-3.5 shrink-0 text-[var(--color-muted-foreground)] transition-transform ${open ? 'rotate-90' : ''}`} />
        {plugin.updateAvailable || remoteUnknown
          ? <AlertTriangle className="size-3.5 shrink-0 text-amber-600" />
          : <PlugZap className="size-3.5 shrink-0 text-emerald-600" />}
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={plugin.id}>{plugin.name}</span>
        <span className={plugin.updateAvailable || remoteUnknown ? 'text-[11px] text-amber-700 dark:text-amber-300' : 'text-[11px] text-[var(--color-muted-foreground)]'}>{status}</span>
        <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-[var(--color-muted-foreground)]">{skills.length} Skills</span>
      </button>
      {open && <div className="pb-2 pl-12 pr-4">
        <div className="mb-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--color-muted-foreground)]">
          {plugin.localVersion && <span>本地 {plugin.localVersion}</span>}
          {plugin.remoteVersion && <span>远端 {plugin.remoteVersion}</span>}
          {plugin.marketplace && <span>{plugin.marketplace}</span>}
        </div>
        <ProvenanceLine provenance={plugin.provenance} />
        <SkillList skills={skills} empty="当前工作目录没有加载该 Plugin 的 Skill。" />
      </div>}
    </div>
  )
}

function SkillGroup({ title, subtitle, skills, defaultOpen = false }: { title: string; subtitle: string; skills: SkillCapability[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}
        className="flex w-full cursor-pointer items-center gap-2 px-4 py-2.5 text-left hover:bg-[var(--color-accent)]/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-ring)]">
        <ChevronRight className={`size-3.5 shrink-0 text-[var(--color-muted-foreground)] transition-transform ${open ? 'rotate-90' : ''}`} />
        <Sparkles className="size-3.5 shrink-0 text-[var(--color-primary)]" />
        <span className="text-xs font-medium">{title}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--color-muted-foreground)]">{subtitle}</span>
        <span className="w-14 shrink-0 text-right text-[11px] text-[var(--color-muted-foreground)]">{skills.length} Skills</span>
      </button>
      {open && <div className="pb-2 pl-12 pr-4"><SkillList skills={skills} empty="没有 Skill。" /></div>}
    </div>
  )
}

function SkillList({ skills, empty }: { skills: SkillCapability[]; empty: string }) {
  if (skills.length === 0) return <p className="text-[11px] text-[var(--color-muted-foreground)]">{empty}</p>
  return (
    <ul className="space-y-1.5">
      {skills.map(skill => (
        <li key={`${skill.pluginId || skill.scope}:${skill.name}`} className="min-w-0 text-[11px]" title={skill.path || undefined}>
          <div className="flex items-center gap-1.5">
            <Sparkles className={`size-3 shrink-0 ${skill.enabled ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted-foreground)]'}`} />
            <span className="min-w-0 truncate font-medium text-[var(--color-foreground)]">{skill.name}</span>
            <ProvenanceInline provenance={skill.provenance} fallback={skill.scope} />
          </div>
          {skill.description && <p className="ml-[18px] mt-0.5 line-clamp-2 text-[10px] leading-4 text-[var(--color-muted-foreground)]">{skill.description}</p>}
        </li>
      ))}
    </ul>
  )
}

function ProvenanceLine({ provenance }: { provenance?: CapabilityProvenance[] }) {
  if (!provenance?.length) {
    return <p className="mb-1.5 text-[10px] text-amber-700 dark:text-amber-300">来源未确认 · 旧协议或引擎未提供来源证据</p>
  }
  return (
    <div className="mb-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-[var(--color-muted-foreground)]" aria-label="能力来源">
      {provenance.map((source, index) => (
        <span key={`${source.origin}:${source.scope}:${source.sourceId || index}`}
          className={source.effective ? 'text-[var(--color-foreground)]' : 'opacity-65'}
          title={`${source.evidence === 'runtime' ? '运行时证据' : '配置证据'}${source.sourceId ? ` · ${source.sourceId}` : ''}`}>
          {ORIGIN_LABEL[source.origin]} · {SCOPE_LABEL[source.scope]}
          {source.effective ? '' : ' · 已被覆盖'}
          {source.evidence === 'configuration' ? ' · 仅配置' : ''}
        </span>
      ))}
    </div>
  )
}

function ProvenanceInline({ provenance, fallback }: { provenance?: CapabilityProvenance[]; fallback?: string }) {
  const effective = provenance?.filter(source => source.effective) ?? []
  const sources = effective.length > 0 ? effective : provenance ?? []
  if (sources.length === 0) {
    return <span className="shrink-0 text-[10px] text-amber-700 dark:text-amber-300">{fallback || '来源未确认'}</span>
  }
  return (
    <span className="shrink-0 text-[10px] text-[var(--color-muted-foreground)]"
      title={sources.map(source => `${ORIGIN_LABEL[source.origin]} · ${SCOPE_LABEL[source.scope]}`).join('；')}>
      {sources.map(source => ORIGIN_LABEL[source.origin]).join(' + ')}
    </span>
  )
}

function EmptyLine({ text }: { text: string }) {
  return <p className="px-4 py-4 text-xs leading-5 text-[var(--color-muted-foreground)]">{text}</p>
}
