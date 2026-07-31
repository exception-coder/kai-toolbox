import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createCodexCrossTopologyServer,
  createCodexDomainKnowledgeServer,
} from './knowledgeMcp.js'

export const CONSULT_READONLY_POLICY = 'consult-readonly'

export const CONSULT_READONLY_PROMPT = [
  '【系统只读安全边界】本会话只能读取、搜索和调用系统明确注入的只读 MCP 工具。',
  '严禁创建、修改、删除、移动或重命名任何文件；严禁执行会改变 Git、依赖、配置、数据库或业务数据的命令。',
  '不得尝试绕过沙箱、切换权限、调用未列入白名单的 MCP/插件/App。若用户要求写操作，直接说明业务咨询为只读模式。',
].join('\n')

/** 找出用户 config.toml 中声明的 MCP server；咨询专用客户端会逐个显式禁用。 */
export function configuredMcpServerNames(codexHome?: string): string[] {
  if (!codexHome) return []
  const configPath = join(codexHome, 'config.toml')
  if (!existsSync(configPath)) return []
  const names = new Set<string>()
  const section = /^\s*\[mcp_servers\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9_-]+))(?:[.\]])/
  for (const line of readFileSync(configPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(section)
    const name = match?.[1] ?? match?.[2] ?? match?.[3]
    if (name) names.add(name)
  }
  return [...names]
}

function createReadonlyDatabaseServer(): Record<string, unknown> | null {
  const apiBase = process.env.TOOLBOX_API_BASE?.trim()
  if (!apiBase) return null
  const here = dirname(fileURLToPath(import.meta.url))
  const js = join(here, 'readonlyMcp.js')
  const ts = join(here, 'readonlyMcp.ts')
  const script = existsSync(js) ? js : ts
  if (!existsSync(script)) return null
  return {
    command: process.execPath,
    args: script === ts ? ['--experimental-strip-types', script] : [script],
    env: { TOOLBOX_API_BASE: apiBase },
    enabled: true,
    enabled_tools: ['erp_db_query', 'srm_db_query', 'scm_db_query'],
    default_tools_approval_mode: 'approve',
  }
}

/**
 * Codex 咨询专用配置：关闭插件/App 等旁路，禁用用户配置里的全部 MCP，
 * 再仅注入平台控制的只读数据库与知识图谱 MCP。
 */
export function consultReadonlyCodexConfig(codexHome?: string): Record<string, unknown> {
  const mcpServers: Record<string, unknown> = {}
  for (const name of configuredMcpServerNames(codexHome)) {
    mcpServers[name] = { enabled: false }
  }

  const database = createReadonlyDatabaseServer()
  const domain = createCodexDomainKnowledgeServer()
  const cross = createCodexCrossTopologyServer()
  if (database) mcpServers['consult-readonly'] = database
  if (domain) mcpServers['domain-knowledge'] = domain
  if (cross) mcpServers['cross-topology'] = cross

  return {
    features: {
      apps: false,
      plugins: false,
      computer_use: false,
      browser_use: false,
      browser_use_external: false,
      code_mode: false,
      code_mode_host: false,
      image_generation: false,
      multi_agent: false,
    },
    mcp_servers: mcpServers,
  }
}
