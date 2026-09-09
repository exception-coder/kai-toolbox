import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

export type CapabilitySnapshotSource = 'claude-sdk' | 'codex-app-server' | 'sidecar-config' | 'unknown'

export type CapabilityOrigin =
  | 'forge-session'
  | 'engine-auth-global'
  | 'plugin'
  | 'project-local'
  | 'engine-builtin'
  | 'unknown'

export type CapabilityScope = 'session' | 'project' | 'auth-directory' | 'engine' | 'plugin' | 'unknown'

export type CapabilityEvidence = 'runtime' | 'configuration'

export type CapabilityProvenance = {
  origin: CapabilityOrigin
  scope: CapabilityScope
  sourceId?: string
  effective: boolean
  evidence: CapabilityEvidence
}

export type CapabilityTool = {
  name: string
  title?: string
  description?: string
  provenance: CapabilityProvenance[]
}

export type McpCapability = {
  name: string
  status: string
  runtimeStatus?: string
  authStatus?: string
  pluginId?: string
  serverTitle?: string
  serverVersion?: string
  verified: boolean
  toolInventoryComplete: boolean
  tools: CapabilityTool[]
  provenance: CapabilityProvenance[]
}

export type SkillCapability = {
  name: string
  description: string
  enabled: boolean
  scope: string
  pluginId?: string
  path?: string
  version?: string
  contentFingerprint?: string
  toolDependencies: string[]
  provenance: CapabilityProvenance[]
}

export function managedSkillEvidence(name: string, path: string | undefined): { version?: string; contentFingerprint?: string } {
  if (name !== 'forge-openspec-continuous-execution' || !path) return {}
  try {
    const content = readFileSync(path)
    const text = content.toString('utf8')
    const version = /^x-forge-version:\s*(.+)$/m.exec(text)?.[1]?.trim()
    return {
      ...(version ? { version } : {}),
      contentFingerprint: createHash('sha256').update(content).digest('hex'),
    }
  } catch {
    return {}
  }
}

export type PluginCapability = {
  id: string
  name: string
  marketplace?: string
  installed: boolean
  enabled: boolean
  localVersion?: string
  remoteVersion?: string
  updateAvailable: boolean
  provenance: CapabilityProvenance[]
}

export type CapabilitySnapshot = {
  slashCommands: string[]
  skills: string[]
  skillDetails: SkillCapability[]
  plugins: PluginCapability[]
  agents: string[]
  mcpServers: McpCapability[]
  outputStyle: string | null
  capabilitySource: CapabilitySnapshotSource
  capabilityRefreshedAt: number
  capabilityErrors: string[]
}

type SnapshotInput = {
  mcpResult?: unknown
  skillsResult?: unknown
  pluginsResult?: unknown
  configuredMcpServers?: Array<{ name: string; status: string }>
  authGlobalMcpServerNames?: string[]
  errors?: string[]
  refreshedAt?: number
}

type McpProvenanceContext = {
  forgeInjectedMcpNames?: Iterable<string>
  authGlobalMcpNames?: Iterable<string>
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function configuredCapabilitySnapshot(
  mcpServers: Array<{ name: string; status: string }>,
  errors: string[] = [],
  authGlobalMcpServerNames: string[] = [],
): CapabilitySnapshot {
  const forgeNames = new Set(mcpServers.map(server => server.name))
  const authNames = new Set(authGlobalMcpServerNames)
  const configuredByName = new Map(mcpServers.map(server => [server.name, server]))
  for (const name of authNames) {
    if (!configuredByName.has(name)) configuredByName.set(name, { name, status: 'configured' })
  }
  return {
    slashCommands: [],
    skills: [],
    skillDetails: [],
    plugins: [],
    agents: [],
    mcpServers: [...configuredByName.values()].map(server => ({
      ...server,
      verified: false,
      toolInventoryComplete: false,
      tools: [],
      provenance: mcpProvenance(server.name, undefined, forgeNames, authNames, false),
    })).sort((left, right) => left.name.localeCompare(right.name)),
    outputStyle: null,
    capabilitySource: 'sidecar-config',
    capabilityRefreshedAt: Date.now(),
    capabilityErrors: errors,
  }
}

function provenance(
  origin: CapabilityOrigin,
  scope: CapabilityScope,
  effective: boolean,
  evidence: CapabilityEvidence,
  sourceId?: string,
): CapabilityProvenance {
  return { origin, scope, ...(sourceId ? { sourceId } : {}), effective, evidence }
}

function mcpProvenance(
  name: string,
  pluginId: string | undefined,
  forgeNames: ReadonlySet<string>,
  authNames: ReadonlySet<string>,
  runtimeConfirmed: boolean,
): CapabilityProvenance[] {
  const sources: CapabilityProvenance[] = []
  const forgeInjected = forgeNames.has(name)
  if (forgeInjected) {
    sources.push(provenance('forge-session', 'session', true,
      runtimeConfirmed ? 'runtime' : 'configuration', name))
  }
  if (pluginId) {
    sources.push(provenance('plugin', 'plugin', !forgeInjected,
      runtimeConfirmed ? 'runtime' : 'configuration', pluginId))
  }
  if (authNames.has(name)) {
    sources.push(provenance('engine-auth-global', 'auth-directory', !forgeInjected && !pluginId,
      runtimeConfirmed ? 'runtime' : 'configuration', name))
  }
  if (sources.length === 0) {
    sources.push(provenance('unknown', 'unknown', runtimeConfirmed,
      runtimeConfirmed ? 'runtime' : 'configuration'))
  }
  return sources
}

function skillProvenance(scope: string, pluginId: string | undefined, enabled: boolean): CapabilityProvenance[] {
  if (pluginId) return [provenance('plugin', 'plugin', enabled, 'runtime', pluginId)]
  if (scope === 'repo') return [provenance('project-local', 'project', enabled, 'runtime')]
  if (scope === 'user' || scope === 'admin') {
    return [provenance('engine-auth-global', 'auth-directory', enabled, 'runtime')]
  }
  if (scope === 'system') return [provenance('engine-builtin', 'engine', enabled, 'runtime')]
  return [provenance('unknown', 'unknown', enabled, 'runtime')]
}

export function parseMcpCapabilities(
  result: unknown,
  context: McpProvenanceContext = {},
): McpCapability[] {
  const forgeNames = new Set(context.forgeInjectedMcpNames ?? [])
  const authNames = new Set(context.authGlobalMcpNames ?? [])
  const root = asRecord(result)
  return asArray(root?.data).flatMap(item => {
    const record = asRecord(item)
    const name = asString(record?.name)
    if (!record || !name) return []
    const toolRecords = asRecord(record.tools) ?? {}
    const pluginId = asString(record.pluginId)
    const serverProvenance = mcpProvenance(name, pluginId, forgeNames, authNames, true)
    const tools = Object.entries(toolRecords).map(([key, raw]) => {
      const tool = asRecord(raw)
      return {
        name: asString(tool?.name) ?? key,
        ...(asString(tool?.title) ? { title: asString(tool?.title) } : {}),
        ...(asString(tool?.description) ? { description: asString(tool?.description) } : {}),
        provenance: serverProvenance.filter(source => source.effective),
      }
    }).sort((left, right) => left.name.localeCompare(right.name))
    const serverInfo = asRecord(record.serverInfo)
    const runtimeStatus = asString(record.runtimeStatus)
    return [{
      name,
      status: runtimeStatus ?? (tools.length > 0 ? 'connected' : 'notStarted'),
      ...(runtimeStatus ? { runtimeStatus } : {}),
      ...(asString(record.authStatus) ? { authStatus: asString(record.authStatus) } : {}),
      ...(pluginId ? { pluginId } : {}),
      ...(asString(serverInfo?.title) ? { serverTitle: asString(serverInfo?.title) } : {}),
      ...(asString(serverInfo?.version) ? { serverVersion: asString(serverInfo?.version) } : {}),
      verified: true,
      toolInventoryComplete: true,
      tools,
      provenance: serverProvenance,
    }]
  })
}

export function parseSkillCapabilities(result: unknown): SkillCapability[] {
  const root = asRecord(result)
  const seen = new Set<string>()
  const skills: SkillCapability[] = []
  for (const entryValue of asArray(root?.data)) {
    const entry = asRecord(entryValue)
    for (const skillValue of asArray(entry?.skills)) {
      const skill = asRecord(skillValue)
      const name = asString(skill?.name)
      if (!skill || !name) continue
      const scope = asString(skill.scope) ?? 'unknown'
      const pluginId = asString(skill.pluginId)
      const key = `${pluginId ?? scope}:${name}`
      if (seen.has(key)) continue
      seen.add(key)
      const dependencies = asRecord(skill.dependencies)
      const toolDependencies = asArray(dependencies?.tools).flatMap(value => {
        const dependency = asRecord(value)
        const type = asString(dependency?.type)
        const dependencyValue = asString(dependency?.value)
        return dependencyValue ? [`${type ? `${type}:` : ''}${dependencyValue}`] : []
      })
      const enabled = skill.enabled !== false
      const path = asString(skill.path)
      skills.push({
        name,
        description: asString(skill.description) ?? '',
        enabled,
        scope,
        ...(pluginId ? { pluginId } : {}),
        ...(path ? { path } : {}),
        ...managedSkillEvidence(name, path),
        toolDependencies,
        provenance: skillProvenance(scope, pluginId, enabled),
      })
    }
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name))
}

export function parsePluginCapabilities(result: unknown): PluginCapability[] {
  const root = asRecord(result)
  const byId = new Map<string, PluginCapability>()
  for (const marketplaceValue of asArray(root?.marketplaces)) {
    const marketplace = asRecord(marketplaceValue)
    const marketplaceName = asString(marketplace?.name)
    for (const pluginValue of asArray(marketplace?.plugins)) {
      const plugin = asRecord(pluginValue)
      const id = asString(plugin?.id)
      if (!plugin || !id) continue
      const installed = plugin.installed === true
      const enabled = plugin.enabled === true
      if (!installed && !enabled) continue
      const localVersion = asString(plugin.localVersion)
      const remoteVersion = asString(plugin.version)
      const candidate: PluginCapability = {
        id,
        name: asString(plugin.name) ?? id,
        ...(marketplaceName ? { marketplace: marketplaceName } : {}),
        installed,
        enabled,
        ...(localVersion ? { localVersion } : {}),
        ...(remoteVersion ? { remoteVersion } : {}),
        updateAvailable: Boolean(localVersion && remoteVersion && localVersion !== remoteVersion),
        provenance: [provenance('plugin', 'auth-directory', enabled, 'runtime', id)],
      }
      const current = byId.get(id)
      if (!current || (!current.installed && installed) || (!current.remoteVersion && remoteVersion)) {
        byId.set(id, candidate)
      }
    }
  }
  return [...byId.values()].sort((left, right) => left.name.localeCompare(right.name))
}

export function buildCodexCapabilitySnapshot(input: SnapshotInput): CapabilitySnapshot {
  const forgeNames = new Set((input.configuredMcpServers ?? []).map(server => server.name))
  const authNames = new Set(input.authGlobalMcpServerNames ?? [])
  const runtimeMcpServers = input.mcpResult === undefined ? [] : parseMcpCapabilities(input.mcpResult, {
    forgeInjectedMcpNames: forgeNames,
    authGlobalMcpNames: authNames,
  })
  const runtimeNames = new Set(runtimeMcpServers.map(server => server.name))
  const configuredByName = new Map((input.configuredMcpServers ?? []).map(server => [server.name, server]))
  for (const name of authNames) {
    if (!configuredByName.has(name)) configuredByName.set(name, { name, status: 'configured' })
  }
  const configuredOnly = [...configuredByName.values()]
    .filter(server => !runtimeNames.has(server.name))
    .map(server => ({
      ...server,
      verified: false,
      toolInventoryComplete: false,
      tools: [] as CapabilityTool[],
      provenance: mcpProvenance(server.name, undefined, forgeNames, authNames, false),
    }))
  const skillDetails = input.skillsResult === undefined ? [] : parseSkillCapabilities(input.skillsResult)
  const plugins = input.pluginsResult === undefined ? [] : parsePluginCapabilities(input.pluginsResult)
  const hasRuntimeResult = input.mcpResult !== undefined || input.skillsResult !== undefined || input.pluginsResult !== undefined
  return {
    slashCommands: [],
    skills: skillDetails.filter(skill => skill.enabled).map(skill => skill.name),
    skillDetails,
    plugins,
    agents: [],
    mcpServers: [...runtimeMcpServers, ...configuredOnly].sort((left, right) => left.name.localeCompare(right.name)),
    outputStyle: null,
    capabilitySource: hasRuntimeResult ? 'codex-app-server' : 'sidecar-config',
    capabilityRefreshedAt: input.refreshedAt ?? Date.now(),
    capabilityErrors: input.errors ?? [],
  }
}
