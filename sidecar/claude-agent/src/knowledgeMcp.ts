import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

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

// PRD 一次性任务由 Java GraphifyQueryService 预查询图谱；业务咨询由 consult-readonly
// MCP 的 source_context 以固定参数调用 graphify CLI，并在 CLI 不可用时只读 graph.json。
// 此处不再维护单项目硬编码的 Graphify MCP，避免与咨询编排入口重复。
