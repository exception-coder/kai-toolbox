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

/**
 * graphify-yoooni：Yoooni ERP 项目代码级知识图谱。
 * 提供 query_graph（按自然语言搜索相关 Java 类/方法/关系）、god_nodes 等工具，
 * 与 domain-knowledge（业务规则/状态机）形成代码+业务的双层上下文。
 *
 * 使用 Python graphify.serve 模块，图谱文件来自
 * project-domain-knowledge/knowledge/yoooni/impl/graphify/graph.json
 * 或 GRAPHIFY_YOOONI_GRAPH 环境变量覆盖。
 */
export function createGraphifyYoooniServer(): Record<string, unknown> | null {
  const graphFile = process.env.GRAPHIFY_YOOONI_GRAPH
    || path.join(
        DEFAULT_WORKSPACE,
        'project-domain-knowledge',
        'knowledge',
        'yoooni',
        'impl',
        'graphify',
        'graph.json'
      )

  if (!existsSync(graphFile)) {
    return null
  }

  // Python 可执行文件：优先 GRAPHIFY_PYTHON 环境变量，其次常见安装路径，最后回退 python
  const candidates = [
    process.env.GRAPHIFY_PYTHON,
    path.join(process.env.LOCALAPPDATA || '', 'Python', 'pythoncore-3.14-64', 'python.exe'),
    'python',
  ].filter((p): p is string => !!p)

  const python = candidates.find(p => {
    try {
      // 简单检查：非相对路径且文件存在，或是命令名（交给系统 PATH）
      return p === 'python' || existsSync(p)
    } catch {
      return false
    }
  }) || 'python'

  return {
    type: 'stdio',
    command: python,
    args: ['-m', 'graphify.serve', graphFile],
    env: { ...process.env },
  }
}
