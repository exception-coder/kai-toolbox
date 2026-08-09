import { existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

/**
 * 业务知识图谱 MCP 服务器配置工厂。
 *
 * project-domain-knowledge 仓库提供了通用的 md+frontmatter 知识引擎（dist/server.js），
 * domain-knowledge 和 cross-topology 都复用同一个引擎，通过 DOMAIN_KB_DIR 环境变量
 * 指向不同的知识库目录（与 claude mcp add 注册时的 -e 参数一致）。
 *
 * 两个服务器均为可选：若引擎或知识库目录不存在，返回 null，调用方跳过。
 */

const DEFAULT_WORKSPACE = path.join(os.homedir(), 'myWork')
const WORKSPACE_CANDIDATES = [
  process.env.KAI_WORKSPACE_ROOT,
  DEFAULT_WORKSPACE,
  // sidecar 默认 cwd=<kai-toolbox>/sidecar/claude-agent，向上三级即各项目共同的 myWork。
  path.resolve(process.cwd(), '..', '..', '..'),
].filter((value): value is string => !!value)

function firstExisting(relativePath: string): string {
  for (const workspace of WORKSPACE_CANDIDATES) {
    const candidate = path.join(workspace, relativePath)
    if (existsSync(candidate)) return candidate
  }
  return path.join(DEFAULT_WORKSPACE, relativePath)
}

/** 知识引擎脚本路径（project-domain-knowledge/dist/server.js） */
function resolveEngine(): string {
  return process.env.DOMAIN_KNOWLEDGE_ENGINE
    || firstExisting(path.join('project-domain-knowledge', 'dist', 'server.js'))
}

const READONLY_KNOWLEDGE_TOOLS = [
  'list_projects',
  'list_modules',
  'list_topics',
  'search_knowledge',
  'locate_menu',
  'get_knowledge',
  'get_related',
]

function codexServer(engine: string, kbDir: string): Record<string, unknown> | null {
  if (!existsSync(engine) || !existsSync(kbDir)) return null
  return {
    command: process.execPath,
    args: [engine],
    env: { DOMAIN_KB_DIR: kbDir },
    enabled: true,
    // reload_knowledge 不进入咨询白名单，避免咨询会话改变服务端运行状态。
    enabled_tools: READONLY_KNOWLEDGE_TOOLS,
    default_tools_approval_mode: 'approve',
  }
}

/**
 * domain-knowledge：业务公共认知（状态机/计算公式/业务流程/业务规则）。
 * 知识库目录来自 DOMAIN_KB_DIR 环境变量（与 claude mcp add 保持一致）。
 */
export function createDomainKnowledgeServer(): Record<string, unknown> | null {
  const engine = resolveEngine()
  const kbDir = process.env.DOMAIN_KB_DIR
    || firstExisting(path.join('project-domain-knowledge', 'knowledge'))

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
 * 知识库目录来自 CROSS_TOPO_KB_DIR 环境变量。
 */
export function createCrossTopologyServer(): Record<string, unknown> | null {
  const engine = resolveEngine()
  const kbDir = process.env.CROSS_TOPO_KB_DIR
    || firstExisting(path.join('cross-project-topology', 'knowledge'))

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
  const engine = resolveEngine()
  const kbDir = process.env.DOMAIN_KB_DIR
    || firstExisting(path.join('project-domain-knowledge', 'knowledge'))
  return codexServer(engine, kbDir)
}

export function createCodexCrossTopologyServer(): Record<string, unknown> | null {
  const engine = resolveEngine()
  const kbDir = process.env.CROSS_TOPO_KB_DIR
    || firstExisting(path.join('cross-project-topology', 'knowledge'))
  return codexServer(engine, kbDir)
}

// PRD 一次性任务由 Java GraphifyQueryService 预查询图谱；业务咨询由 consult-readonly
// MCP 的 source_context 以固定参数调用 graphify CLI，并在 CLI 不可用时只读 graph.json。
// 此处不再维护单项目硬编码的 Graphify MCP，避免与咨询编排入口重复。
