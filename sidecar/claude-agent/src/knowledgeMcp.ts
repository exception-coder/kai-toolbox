import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

/**
 * 业务知识图谱 MCP 服务器配置工厂。
 *
 * project-domain-knowledge 仓库提供了通用的 md+frontmatter 知识引擎（dist/server.js），
 * domain-knowledge 和 cross-topology 都复用正式 team-tools 中的同一个引擎，
 * 通过 DOMAIN_KB_DIR 指向各自知识库；受控部署可用环境变量显式覆盖默认路径。
 *
 * 两个服务器均为可选：若引擎或知识库目录不存在，返回 null，调用方跳过。
 */

type KnowledgeMcpEnvironment = Readonly<Record<string, string | undefined>>

export interface KnowledgeMcpPathOptions {
  homeDir?: string
  env?: KnowledgeMcpEnvironment
}

export interface KnowledgeMcpPaths {
  engine: string
  domainKnowledge: string
  crossTopology: string
}

export interface ReadonlyKnowledgeMcpCall {
  server: 'domain-knowledge' | 'cross-topology'
  tool: string
  arguments: Record<string, unknown>
}

export interface KnowledgeMcpCallRuntime {
  call: (call: ReadonlyKnowledgeMcpCall, timeoutMs: number, signal?: AbortSignal) => Promise<unknown>
}

const DEFAULT_RECOVERY_TIMEOUT_MS = 8_000
const MAX_RECOVERY_RESULT_CHARS = 16_000

const BASE_READONLY_KNOWLEDGE_TOOLS = [
  'list_projects',
  'list_modules',
  'list_topics',
  'search_knowledge',
  'locate_menu',
  'get_knowledge',
  'get_related',
] as const

export const DOMAIN_KNOWLEDGE_CORE_SPEC_TOOLS = [
  'get_module_core_spec',
  'resolve_consult_context',
] as const

export const DOMAIN_KNOWLEDGE_READONLY_TOOLS = [
  ...BASE_READONLY_KNOWLEDGE_TOOLS,
  ...DOMAIN_KNOWLEDGE_CORE_SPEC_TOOLS,
] as const

export const CROSS_TOPOLOGY_READONLY_TOOLS = [...BASE_READONLY_KNOWLEDGE_TOOLS] as const

function configuredPath(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback
}

/** 团队知识资产只从正式安装目录解析；业务源码工作区不得参与知识库发现。 */
export function resolveKnowledgeMcpPaths(options: KnowledgeMcpPathOptions = {}): KnowledgeMcpPaths {
  const env = options.env ?? process.env
  const teamToolsRoot = path.join(options.homeDir ?? os.homedir(), '.kai-toolbox', 'team-tools')
  return {
    engine: configuredPath(
      env.DOMAIN_KNOWLEDGE_ENGINE,
      path.join(teamToolsRoot, 'project-domain-knowledge', 'dist', 'server.js'),
    ),
    domainKnowledge: configuredPath(
      env.DOMAIN_KB_DIR,
      path.join(teamToolsRoot, 'project-domain-knowledge', 'knowledge'),
    ),
    crossTopology: configuredPath(
      env.CROSS_TOPO_KB_DIR,
      path.join(teamToolsRoot, 'cross-project-topology', 'knowledge'),
    ),
  }
}

function codexServer(
  engine: string,
  kbDir: string,
  enabledTools: readonly string[],
): Record<string, unknown> | null {
  if (!existsSync(engine) || !existsSync(kbDir)) return null
  return {
    command: process.execPath,
    args: [engine],
    env: { DOMAIN_KB_DIR: kbDir },
    enabled: true,
    // reload_knowledge 不进入咨询白名单，避免咨询会话改变服务端运行状态。
    enabled_tools: [...enabledTools],
    default_tools_approval_mode: 'approve',
  }
}

/**
 * domain-knowledge：业务公共认知（状态机/计算公式/业务流程/业务规则）。
 * 默认读取正式 team-tools；DOMAIN_KB_DIR 可用于受控部署覆盖。
 */
export function createDomainKnowledgeServer(): Record<string, unknown> | null {
  const paths = resolveKnowledgeMcpPaths()
  const engine = paths.engine
  const kbDir = paths.domainKnowledge

  if (!existsSync(engine) || !existsSync(kbDir)) {
    return null
  }

  return {
    type: 'stdio',
    command: 'node',
    args: [engine],
    env: { ...process.env, DOMAIN_KB_DIR: kbDir },
  }
}

/**
 * cross-topology：跨项目拓扑认知（状态枚举值、API 路径、表字段、模块依赖）。
 * 默认读取正式 team-tools；CROSS_TOPO_KB_DIR 可用于受控部署覆盖。
 */
export function createCrossTopologyServer(): Record<string, unknown> | null {
  const paths = resolveKnowledgeMcpPaths()
  const engine = paths.engine
  const kbDir = paths.crossTopology

  if (!existsSync(engine) || !existsSync(kbDir)) {
    return null
  }

  return {
    type: 'stdio',
    command: 'node',
    args: [engine],
    env: { ...process.env, DOMAIN_KB_DIR: kbDir },
  }
}

/** Codex CLI config.toml 形态的只读知识 MCP（区别于 Claude SDK 的 type=stdio 形态）。 */
export function createCodexDomainKnowledgeServer(): Record<string, unknown> | null {
  const paths = resolveKnowledgeMcpPaths()
  return codexServer(paths.engine, paths.domainKnowledge, DOMAIN_KNOWLEDGE_READONLY_TOOLS)
}

export function createCodexCrossTopologyServer(): Record<string, unknown> | null {
  const paths = resolveKnowledgeMcpPaths()
  return codexServer(paths.engine, paths.crossTopology, CROSS_TOPOLOGY_READONLY_TOOLS)
}

export function readonlyKnowledgeMcpCall(
  toolName: string,
  toolInput?: Record<string, unknown>,
): ReadonlyKnowledgeMcpCall | undefined {
  if (!toolInput) return undefined
  const normalized = normalizeKnowledgeToolName(toolName)
  if (!normalized) return undefined
  const allowed: readonly string[] = normalized.server === 'domain-knowledge'
    ? DOMAIN_KNOWLEDGE_READONLY_TOOLS
    : CROSS_TOPOLOGY_READONLY_TOOLS
  if (!allowed.includes(normalized.tool)) return undefined
  return { ...normalized, arguments: toolInput }
}

export async function retryReadonlyKnowledgeMcp(
  call: ReadonlyKnowledgeMcpCall,
  runtime: KnowledgeMcpCallRuntime = DEFAULT_KNOWLEDGE_MCP_RUNTIME,
  timeoutMs = DEFAULT_RECOVERY_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<unknown> {
  return runtime.call(call, timeoutMs, signal)
}

export function knowledgeMcpRecoveryPrompt(call: ReadonlyKnowledgeMcpCall, result: unknown): string {
  const output = stringifyRecoveryResult(result)
  return [
    '系统恢复提示：上一轮只读知识 MCP 通道超时，Forge 已在隔离进程中重新执行成功。',
    `工具：${call.server}/${call.tool}`,
    '以下内容是该工具的真实返回结果：',
    output,
    '请从中断点继续原任务。不要重复已经完成的操作，也不要再次调用上述工具；如结果表示无资产，请按无资产正常降级处理。',
  ].join('\n\n')
}

function normalizeKnowledgeToolName(toolName: string): Pick<ReadonlyKnowledgeMcpCall, 'server' | 'tool'> | undefined {
  const slash = toolName.match(/^(domain-knowledge|cross-topology)\/(.+)$/)
  if (slash) return { server: slash[1] as ReadonlyKnowledgeMcpCall['server'], tool: slash[2] }
  const codex = toolName.match(/^mcp__(domain[-_]knowledge|cross[-_]topology)__(.+)$/)
  if (!codex) return undefined
  return {
    server: codex[1].replace('_', '-') as ReadonlyKnowledgeMcpCall['server'],
    tool: codex[2],
  }
}

function stringifyRecoveryResult(result: unknown): string {
  const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
  return text.length <= MAX_RECOVERY_RESULT_CHARS
    ? text
    : `${text.slice(0, MAX_RECOVERY_RESULT_CHARS)}\n…(结果已截断)`
}

const DEFAULT_KNOWLEDGE_MCP_RUNTIME: KnowledgeMcpCallRuntime = {
  async call(call, timeoutMs, signal) {
    const paths = resolveKnowledgeMcpPaths()
    const knowledgeDir = call.server === 'domain-knowledge' ? paths.domainKnowledge : paths.crossTopology
    if (!existsSync(paths.engine) || !existsSync(knowledgeDir)) {
      throw new Error(`${call.server} MCP 安装目录不完整`)
    }
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [paths.engine],
      env: { ...process.env, DOMAIN_KB_DIR: knowledgeDir } as Record<string, string>,
      stderr: 'pipe',
    })
    const client = new Client({ name: 'kai-toolbox-mcp-recovery', version: '0.1.0' }, { capabilities: {} })
    let timer: NodeJS.Timeout | undefined
    let rejectCancellation: ((reason?: unknown) => void) | undefined
    const cancellation = new Promise<never>((_, reject) => { rejectCancellation = reject })
    const onAbort = () => rejectCancellation?.(signal?.reason ?? new Error('MCP 隔离重试已取消'))
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
    try {
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${call.server}/${call.tool} 隔离重试超时（${timeoutMs}ms）`)), timeoutMs)
        timer.unref?.()
      })
      await Promise.race([client.connect(transport), deadline, cancellation])
      return await Promise.race([
        client.callTool({ name: call.tool, arguments: call.arguments }),
        deadline,
        cancellation,
      ])
    } finally {
      if (timer) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      await transport.close().catch(() => undefined)
    }
  },
}

// PRD 一次性任务由 Java GraphifyQueryService 预查询图谱；业务咨询由 consult-readonly
// MCP 的 source_context 以固定参数调用 graphify CLI，并在 CLI 不可用时只读 graph.json。
// 此处不再维护单项目硬编码的 Graphify MCP，避免与咨询编排入口重复。
