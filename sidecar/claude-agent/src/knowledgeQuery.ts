import {
  CROSS_TOPOLOGY_READONLY_TOOLS, DOMAIN_KNOWLEDGE_READONLY_TOOLS,
  retryReadonlyKnowledgeMcp, type KnowledgeMcpCallRuntime,
} from './knowledgeMcp.js'

const MAX_ARGUMENT_CHARS = 16_000
const MAX_SOURCE_CHARS = 32_000

/** 统一只读门面；库内继承、评审与版本判断仍由原知识引擎负责。 */
export const knowledgeQueryTool = {
  name: 'knowledge_query',
  description: '统一查询业务知识与跨项目拓扑。先 list_projects 确认知识库 project key，再 search_knowledge/get_knowledge；用 domain 的 resolve_project_context、list_spec_candidates/get_spec_candidate 查询继承和当前评审。来源独立返回，草稿和源码推断不等于已确认业务事实。',
  inputSchema: {
    type: 'object',
    properties: {
      source: { type: 'string', enum: ['domain', 'topology', 'all'], description: '业务知识、跨项目拓扑或两者' },
      action: { type: 'string', enum: [...DOMAIN_KNOWLEDGE_READONLY_TOOLS], description: '原知识引擎只读工具名' },
      arguments: { type: 'object', description: 'list_projects:{}；list_modules:{project?}；list_topics:{project?,module?,type?}；search_knowledge:{query,project?,module?,type?}；locate_menu:{query,project?}；get_knowledge/get_related:{id}；resolve_project_context:{project}；list_spec_candidates:{project?,module?,kind?,status?,limit?}；get_spec_candidate:{id,project?}；get_module_core_spec:{project,module,query,sections?,limit?}；resolve_consult_context:{project,question,menuName?,url?,moduleHint?}。候选、context、Core Spec 工具仅 domain 支持。' },
    },
    required: ['source', 'action', 'arguments'], additionalProperties: false,
  },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}

export async function queryKnowledge(input: Record<string, unknown>, runtime?: KnowledgeMcpCallRuntime) {
  const { source, action, arguments: args } = input
  if (!['domain', 'topology', 'all'].includes(String(source))) throw new Error('请选择 domain、topology 或 all')
  if (typeof action !== 'string' || !(DOMAIN_KNOWLEDGE_READONLY_TOOLS as readonly string[]).includes(action)) {
    throw new Error('知识查询只允许已登记的只读 action，不能重载或写入知识库')
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)
    || JSON.stringify(args).length > MAX_ARGUMENT_CHARS) throw new Error('arguments 必须是有界 JSON 对象')
  const sources = source === 'all' ? ['domain', 'topology'] as const : [source as 'domain' | 'topology']
  const results = await Promise.all(sources.map(async selected => {
    if (selected === 'topology' && !(CROSS_TOPOLOGY_READONLY_TOOLS as readonly string[]).includes(action)) {
      return { source: selected, status: 'UNSUPPORTED', message: '该 action 仅适用于业务知识库' }
    }
    try {
      const result = await retryReadonlyKnowledgeMcp({
        server: selected === 'domain' ? 'domain-knowledge' : 'cross-topology',
        tool: action, arguments: args as Record<string, unknown>,
      }, runtime)
      const text = typeof result === 'string' ? result : JSON.stringify(result)
      const isError = !!(result && typeof result === 'object' && 'isError' in result && result.isError)
      return {
        source: selected, status: isError ? 'ERROR' : 'OK', truncated: text.length > MAX_SOURCE_CHARS,
        content: text.slice(0, MAX_SOURCE_CHARS),
      }
    } catch {
      return { source: selected, status: 'UNAVAILABLE', message: '知识库不可用或查询超时，请检查团队工具安装与知识库路径' }
    }
  }))
  return { action, results }
}
