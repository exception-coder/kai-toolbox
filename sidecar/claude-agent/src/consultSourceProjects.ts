export interface SourceProject { id: string; name: string; label: string; path: string }
export interface SourceRouting {
  automatic: boolean; focusedProject: string | null; projects: SourceProject[]
  evidencePath?: string | null; reason?: string | null; selectedBy?: string | null
}
export interface SourceRoutingContext { apiBase: string; session?: string; token?: string }

export const sourceProjectsTool = {
  name: 'source_projects',
  description: '查看本咨询授权的候选项目（常用排序不代表归属）。先按截图/页面语义探索最可能的三个，未命中换下一个；图谱排队不重复等待。定位前端后沿接口核对服务端，再通过 select 和相对文件证据记录服务端焦点。仅改变咨询分析元数据，不授予数据库或终端权限。',
  inputSchema: { type: 'object', properties: {
    action: { type: 'string', enum: ['list', 'select'] },
    project: { type: 'string', description: '候选项目 id，不接受目录或自造系统名' },
    evidencePath: { type: 'string', description: 'select 时必填：已核对的服务端文件相对路径' },
    reason: { type: 'string', maxLength: 600, description: 'select 时必填：页面或请求如何关联到此服务端；模型判断不等于人工确认' },
  }, additionalProperties: false },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
}

export async function sourceRouting(context: SourceRoutingContext, selection?: Record<string, unknown>,
  target?: { project?: unknown; path?: unknown }): Promise<SourceRouting | null> {
  if (!context.apiBase || !context.session || !context.token) {
    if (selection) throw new Error('未配置可信咨询路由上下文')
    return null
  }
  const query = new URLSearchParams()
  if (typeof target?.project === 'string') query.set('project', target.project)
  if (typeof target?.path === 'string') query.set('path', target.path)
  const response = await fetch(`${context.apiBase}/api/fore-consult/resources/sessions/${encodeURIComponent(context.session)}/source-routing${query.size ? '?' + query : ''}`, {
    method: selection ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'X-Consult-Resource-Token': context.token },
    ...(selection ? { body: JSON.stringify(selection) } : {}), signal: AbortSignal.timeout(8000),
  })
  if (!response.ok) throw new Error('无法核验当前咨询源码范围；不会回退到启动锚点，请重试或纠正系统')
  const value: unknown = await response.json()
  if (value === null) return null
  const scope = value as SourceRouting
  if (!scope || typeof scope.automatic !== 'boolean' || !Array.isArray(scope.projects) || scope.projects.length > 8
      || scope.projects.some(project => !project || typeof project.id !== 'string' || typeof project.path !== 'string'
        || !project.path.trim() || typeof project.name !== 'string')) throw new Error('服务端源码路由无效')
  return scope
}

export function publicSourceRouting(scope: SourceRouting | null): unknown {
  return scope ? { ...scope, projects: scope.projects.map(({ id, name, label }) => ({ id, name, label })) }
    : { mode: 'LEGACY_SINGLE_PROJECT', note: '旧咨询沿用原源码目录，新建自动识别咨询可跨候选探索' }
}

export async function callSourceProjects(args: Record<string, unknown>, context: SourceRoutingContext): Promise<unknown> {
  const action = args.action ?? 'list'
  if (action !== 'list' && action !== 'select') throw new Error('source_projects.action 只能为 list 或 select')
  if (action === 'select' && (typeof args.project !== 'string' || typeof args.evidencePath !== 'string'
      || typeof args.reason !== 'string' || !args.reason.trim() || args.reason.length > 600)) {
    throw new Error('选择服务端需要候选 project、evidencePath 与 reason')
  }
  return publicSourceRouting(await sourceRouting(context, action === 'select'
    ? { project: args.project, evidencePath: args.evidencePath, reason: args.reason } : undefined))
}
