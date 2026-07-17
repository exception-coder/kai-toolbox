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

/** 知识引擎脚本路径（project-domain-knowledge/dist/server.js） */
function resolveEngine(): string {
  return process.env.DOMAIN_KNOWLEDGE_ENGINE
    || path.join(DEFAULT_WORKSPACE, 'project-domain-knowledge', 'dist', 'server.js')
}

/**
 * domain-knowledge：业务公共认知（状态机/计算公式/业务流程/业务规则）。
 * 知识库目录来自 DOMAIN_KB_DIR 环境变量（与 claude mcp add 保持一致）。
 */
export function createDomainKnowledgeServer(): Record<string, unknown> | null {
  const engine = resolveEngine()
  const kbDir = process.env.DOMAIN_KB_DIR
    || path.join(DEFAULT_WORKSPACE, 'project-domain-knowledge', 'knowledge')

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
    || path.join(DEFAULT_WORKSPACE, 'cross-project-topology', 'knowledge')

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

// graphify（代码知识图谱）不再走 MCP：已改为 Java 侧（tool-prd-clarify 的
// GraphifyQueryService）在调用 Claude 前直接执行 `graphify query` CLI 子进程，
// 按 project/module 解析到正确的图谱目录，查询结果作为 prompt 上下文注入。
// 交互式 Vibe Coding 会话若 cwd 本身在某个含 graphify-out 的项目根下，Claude 已有
// Bash 工具，可直接跑 CLI，同样无需 MCP。此前的 createGraphifyYoooniServer()（起
// python -m graphify.serve 子进程）只覆盖单个硬编码项目、且经常启动失败，已移除。
