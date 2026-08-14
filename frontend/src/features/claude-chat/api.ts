import { authFetch, http } from '@/lib/api'
import { ensureFreshToken, getToken } from '@/lib/auth'
import { listSystemModules, listSystemWorkspaces, saveSystemProjectAlias } from '@/lib/systemCatalog'
import type {
  CommitDiff,
  CommitsResponse,
  GitFileDiffResponse,
  GitRepoRef,
  GitStatusResponse,
} from '@/components/git/types'
import type { ChatItem, ClaudeChatSessionView, CloneResult, FileContent, FileEntry, HistorySessionView, KnowledgeEnsureResult, ModelInfo, ModuleResolve, ModuleSyncPreview, ModuleSyncResult, NotifyConfig, OnboardView, PendingSqlChangeType, PendingSqlStatus, PluginStatus, ServerMessage, SessionPendingSql, SessionSiteConfiguration, SidecarVersion, SuiteStatus, ProjectModules, SelfRepo, SubdirList, TaskspaceView, WorkspaceList } from './types'
import { normalizeUserMessageForDisplay } from './messageDisplay'

/** 查询会话关联的 SQL 登记；未登记返回 null。 */
export async function getSessionPendingSql(sessionId: string): Promise<SessionPendingSql | null> {
  const result = await http<SessionPendingSql | undefined>(
    `/claude-chat/sessions/${encodeURIComponent(sessionId)}/pending-sql`,
  )
  return result ?? null
}

/** 保存登记。保存正文意味着有新变更，后端会把状态置为待执行。 */
export function saveSessionPendingSql(sessionId: string, input: {
  title?: string
  targetEnvironment?: string
  changeType: PendingSqlChangeType
  sqlText: string
}): Promise<SessionPendingSql> {
  return http(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/pending-sql`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

/** 人工更新 SQL 登记状态，接口不会执行 SQL。 */
export function updateSessionPendingSqlStatus(
  sessionId: string,
  status: PendingSqlStatus,
): Promise<SessionPendingSql> {
  return http(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/pending-sql/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
}

/** 解除会话的 SQL 登记。 */
export function deleteSessionPendingSql(sessionId: string): Promise<void> {
  return http(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/pending-sql`, { method: 'DELETE' })
}

/** 列会话目录下可查看提交的 git 仓库（cwd 自身是仓库→单个；否则其子目录里的仓库）。空数组=无仓库。 */
export function listSessionGitRepos(sessionId: string) {
  return http<GitRepoRef[]>(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/git/repos`)
}

/** 列会话工作目录(git 仓库)的最近提交。后端按 sessionId 解析 cwd；repo 指定子仓库（父目录聚合场景）。 */
export function listSessionCommits(sessionId: string, limit?: number, repo?: string) {
  const p = new URLSearchParams()
  if (limit) p.set('limit', String(limit))
  if (repo) p.set('repo', repo)
  const qs = p.toString() ? `?${p.toString()}` : ''
  return http<CommitsResponse>(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/git/commits${qs}`)
}

/** 取会话目录某提交的 diff。repo 指定子仓库。 */
export function getSessionCommitDiff(sessionId: string, hash: string, repo?: string) {
  const p = new URLSearchParams({ hash })
  if (repo) p.set('repo', repo)
  return http<CommitDiff>(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/git/commit?${p.toString()}`)
}

// ── git status ───────────────────────────────────────────────────────────────

/** 获取单个文件相对于 HEAD 的 unified diff，用于侧边对比视图。 */
export function fetchSessionGitFileDiff(
  sessionId: string,
  filePath: string,
  x: string,
  repo?: string,
): Promise<GitFileDiffResponse> {
  const p = new URLSearchParams({ filePath, x })
  if (repo) p.set('repo', repo)
  return http<GitFileDiffResponse>(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/git/diff?${p.toString()}`)
}

/** 获取会话工作目录的待提交/未跟踪文件列表（git status --porcelain）。 */
export function fetchSessionGitStatus(sessionId: string, repo?: string): Promise<GitStatusResponse> {
  const p = new URLSearchParams()
  if (repo) p.set('repo', repo)
  const qs = p.toString() ? `?${p.toString()}` : ''
  return http<GitStatusResponse>(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/git/status${qs}`)
}

/**
 * 取后端最近日志（含透传进来的 sidecar 日志），用于排查时一键复制贴给 AI。
 * 返回纯文本（后端 text/plain）。mode：error=最近告警+上下文（默认）/ all=最近全量。
 */
export async function fetchRecentLogs(mode: 'error' | 'all' = 'error', limit = 200): Promise<string> {
  const qs = new URLSearchParams({ mode, limit: String(limit) })
  const res = await authFetch(`/system/logs?${qs.toString()}`)
  if (!res.ok) {
    throw new Error(res.status === 401 ? '未登录或登录已过期，无法读取日志' : `读取日志失败：HTTP ${res.status}`)
  }
  return res.text()
}

export interface SessionUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreateTokens: number
  totalTokens: number
  turns: number
}

/** 整会话累计用量：后端读 transcript 求和，按 sessionId 返回准确总和（不受前端分页影响）。 */
export function fetchSessionUsage(sessionId: string) {
  return http<SessionUsage>(`/claude-chat/history/${encodeURIComponent(sessionId)}/usage`)
}

/** 查 team-standards 在 Claude/Codex 两端的版本。 */
export function getPluginStatus() {
  return http<PluginStatus>('/claude-chat/plugins/status')
}

/** 列团队套件状态（3 插件 + 2 MCP，当前会话所用）。fetch=true 时先 git fetch MCP 知识库，使「落后远端」准确（较慢）。 */
export function listSuites(sessionId?: string, fetch = false) {
  const params = new URLSearchParams()
  if (sessionId) params.set('sessionId', sessionId)
  if (fetch) params.set('fetch', 'true')
  const query = params.toString()
  return http<SuiteStatus[]>(`/claude-chat/plugins/suites${query ? `?${query}` : ''}`)
}

/** 检查团队依赖安装所需的本机 CLI 环境。 */
export function getTeamDependencyEnvironment(sessionId?: string) {
  return http<import('./types').TeamDependencyEnvironment>(
    `/claude-chat/plugins/environment${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`,
  )
}

export function listTeamRepositories(source: 'gitee' | 'github', fetch = false) {
  const params = new URLSearchParams({ source, fetch: String(fetch) })
  return http<import('./types').TeamRepositoryStatus[]>(`/claude-chat/plugins/repositories?${params.toString()}`)
}

/** 查询 kai-toolbox 托管的 ERP、ERP 小程序、SRM、SCM 业务源码状态。 */
export function listBusinessSystemWorkspaces(fetch = false) {
  return http<import('./types').BusinessSystemWorkspace[]>(
    `/claude-chat/plugins/business-systems?fetch=${String(fetch)}`,
  )
}

/** 同步全部或指定业务系统源码的 SSE 端点。 */
export function businessWorkspaceSyncStreamPath(system: 'all' | import('./types').BusinessSystemWorkspace['id'] = 'all') {
  return `/claude-chat/plugins/business-systems/sync/stream?system=${encodeURIComponent(system)}`
}

/** 查看固定团队依赖仓库的未提交文件。 */
export function fetchTeamRepositoryGitStatus(repository: string): Promise<GitStatusResponse> {
  return http<GitStatusResponse>(
    `/claude-chat/plugins/repositories/${encodeURIComponent(repository)}/status`,
  )
}

/** 查看固定团队依赖仓库中单个文件相对 HEAD 的差异。 */
export function fetchTeamRepositoryGitFileDiff(
  repository: string,
  filePath: string,
  x: string,
): Promise<GitFileDiffResponse> {
  const params = new URLSearchParams({ filePath, x })
  return http<GitFileDiffResponse>(
    `/claude-chat/plugins/repositories/${encodeURIComponent(repository)}/diff?${params.toString()}`,
  )
}

/** 将团队源码中的 yoooni-erp-auto-dev 同步到 Claude/Codex 当前插件缓存。 */
export function syncYoooniErpAutoDev() {
  return http<import('./types').SkillSyncResult>('/claude-chat/plugins/skills/yoooni-erp-auto-dev/sync', {
    method: 'POST',
  })
}

/** 一键更新双端插件的 SSE 端点（用 authEventSource 连接，自动带 JWT；连上即触发）。 */
export function pluginUpdateStreamPath(sessionId?: string) {
  return `/claude-chat/plugins/update/stream${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`
}

/** 拉取五个团队依赖仓库，并安装到 Claude Code 与 Codex。 */
export function pluginInstallStreamPath(sessionId: string | undefined, source: 'gitee' | 'github') {
  const params = new URLSearchParams({ source })
  if (sessionId) params.set('sessionId', sessionId)
  return `/claude-chat/plugins/install/stream?${params.toString()}`
}

/** 查 sidecar 的 Claude Agent SDK 版本。check=true 时联网查 npm 最新版并判断是否落后（较慢）。 */
export function getSidecarVersion(check = false) {
  return http<SidecarVersion>(`/claude-chat/sidecar/version${check ? '?check=true' : ''}`)
}

/** 用当前（草稿）配置触发后端发一条测试推送，返回实际尝试的渠道（bark / ntfy）。 */
export function testServerPush(config: NotifyConfig) {
  return http<{ channels: string[] }>('/claude-chat/notify/test', {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export function listSessions() {
  return http<ClaudeChatSessionView[]>('/claude-chat/sessions')
}

/** Reads the Codex model catalog used by Vibe Coding for a selected authorization directory. */
export function fetchCodexModels(codexHome: string) {
  const params = new URLSearchParams({ codexHome })
  return http<ModelInfo[]>(`/claude-chat/codex/models?${params.toString()}`)
}

/** 拉第三方网关的可用模型目录（后端代理 GET {baseUrl}/v1/models，避免浏览器 CORS）。error 非空=拉取失败原因。 */
export function fetchProviderModels(baseUrl: string, key: string) {
  return http<{ models: ModelInfo[]; error?: string | null }>('/claude-chat/provider/models', {
    method: 'POST',
    body: JSON.stringify({ baseUrl, key }),
  })
}

/** 列出配置根目录下的一级子目录，供新建会话选 cwd。 */
export function listWorkspaces(): Promise<WorkspaceList> {
  return listSystemWorkspaces()
}

/** 保存或清除项目展示别名。 */
export function saveProjectAlias(projectPath: string, alias: string) {
  return saveSystemProjectAlias(projectPath, alias)
}

/** 「自维护机器人」锁定的 kai-toolbox 自身仓库路径；exists=false 时前端隐藏机器人入口。 */
export function getSelfRepo() {
  return http<SelfRepo>('/claude-chat/workspaces/self')
}

/** 拉取（git clone）新项目到指定工作区根（须为配置的 workspace 根之一），返回落地路径可直接当 cwd。 */
export function cloneProject(url: string, root: string) {
  return http<CloneResult>('/claude-chat/workspaces/clone', {
    method: 'POST',
    body: JSON.stringify({ url, root }),
  })
}

/** 某项目下的模块（确定性扫描，按构建标志文件）。供「项目工作台」列模块、懒建会话。 */
export function fetchProjectModules(path: string): Promise<ProjectModules> {
  return listSystemModules(path)
}

/** Lists staged, unstaged and untracked files for a configured workspace project. */
export function fetchWorkspaceGitStatus(path: string): Promise<GitStatusResponse> {
  const params = new URLSearchParams({ path })
  return http<GitStatusResponse>(`/claude-chat/workspaces/git/status?${params.toString()}`)
}

/** Returns one changed file's unified diff for a configured workspace project. */
export function fetchWorkspaceGitFileDiff(
  path: string,
  filePath: string,
  x: string,
): Promise<GitFileDiffResponse> {
  const params = new URLSearchParams({ path, filePath, x })
  return http<GitFileDiffResponse>(`/claude-chat/workspaces/git/file-diff?${params.toString()}`)
}

/** 「更新项目模块」预览：按目录结构重新解析，与 modules.json 出 diff（只读）。 */
export function previewModuleSync(path: string) {
  return http<ModuleSyncPreview>(`/claude-chat/workspaces/modules/sync/preview?path=${encodeURIComponent(path)}`)
}

/** 「更新项目模块」应用：把勾选的新增候选追加进 modules.json（只新增、不删除）。 */
export function applyModuleSync(path: string, modules: { key: string; codePath: string }[]) {
  return http<ModuleSyncResult>('/claude-chat/workspaces/modules/sync/apply', {
    method: 'POST',
    body: JSON.stringify({ path, modules }),
  })
}

/** 检查团队初始化生成的固定知识库目录是否就绪。 */
export function ensureKnowledgeBase() {
  return http<KnowledgeEnsureResult>('/claude-chat/workspaces/knowledge/ensure', {
    method: 'POST',
    signal: AbortSignal.timeout(120_000),
  })
}

/** 模块路由：把一句自然语言确定性解析为候选 (项目, 模块)，供「说一句话拉起模块会话」。 */
export function resolveModule(q: string) {
  return http<ModuleResolve>(`/claude-chat/workspaces/resolve?q=${encodeURIComponent(q)}`)
}

/** 列出「项目初始化流水线」(yoooni-onboard-pipeline) 各系统的六阶段进度（镜像状态文件，后端只读）。 */
export function listOnboard() {
  return http<OnboardView[]>('/claude-chat/onboard')
}

/** 列会话工作目录下某子目录（相对 cwd，空=根）的一级内容，供文件树懒加载。 */
export function listSessionFiles(sessionId: string, path?: string) {
  const qs = path ? `?path=${encodeURIComponent(path)}` : ''
  return http<FileEntry[]>(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/files${qs}`)
}

/** 读会话工作目录下某文本文件（相对 cwd）预览。 */
export function readSessionFile(sessionId: string, path: string) {
  return http<FileContent>(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/file?path=${encodeURIComponent(path)}`)
}

/** 在系统资源管理器/Finder 里定位会话工作目录下的文件/目录（相对 cwd）。 */
export function revealSessionFile(sessionId: string, path: string) {
  return http<void>(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/reveal`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  })
}

// ── 合并工作区 taskspace：父目录多选 → 建软链接聚合成新工作区 ──────────

/** 列任意父目录的一级子目录，供多选。 */
export function listTaskspaceSubdirs(parent: string) {
  return http<SubdirList>(`/claude-chat/taskspace/subdirs?parent=${encodeURIComponent(parent)}`)
}

/** 在 base 下创建 name 工作区，为每个 member 目录建链接。 */
export function createTaskspace(base: string, name: string, members: string[]) {
  return http<TaskspaceView>('/claude-chat/taskspace/create', {
    method: 'POST',
    body: JSON.stringify({ base, name, members }),
  })
}

/** 读工作区清单 + 链接存活状态。 */
export function getTaskspaceInfo(dir: string) {
  return http<TaskspaceView>(`/claude-chat/taskspace/info?dir=${encodeURIComponent(dir)}`)
}

/** 向工作区追加链接。 */
export function addTaskspaceMembers(dir: string, members: string[]) {
  return http<TaskspaceView>('/claude-chat/taskspace/add', {
    method: 'POST',
    body: JSON.stringify({ dir, members }),
  })
}

/** 从工作区移除若干链接（只删链接，不动源目录）。 */
export function removeTaskspaceLinks(dir: string, links: string[]) {
  return http<TaskspaceView>('/claude-chat/taskspace/remove', {
    method: 'POST',
    body: JSON.stringify({ dir, links }),
  })
}

/** 整体拆除工作区（只删链接 + 清单，源目录不触碰）。 */
export function teardownTaskspace(dir: string) {
  return http<void>('/claude-chat/taskspace/teardown', {
    method: 'POST',
    body: JSON.stringify({ dir }),
  })
}

export function deleteSession(id: string) {
  return http<void>(`/claude-chat/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/** 重命名工具会话（改 SQLite title）。 */
export function renameSession(id: string, title: string) {
  return http<void>(`/claude-chat/sessions/${encodeURIComponent(id)}/title`, {
    method: 'PUT',
    body: JSON.stringify({ title }),
  })
}

/** 设置/清除会话分组（后端持久化，跨端可见）；group 传空串=移出分组。 */
export function setSessionGroupApi(id: string, group: string | null, subgroup?: string | null) {
  return http<void>(`/claude-chat/sessions/${encodeURIComponent(id)}/group`, {
    method: 'PUT',
    body: JSON.stringify({ group: group ?? '', subgroup: group ? subgroup ?? '' : '' }),
  })
}

/** 重命名会话项目；后端一次性迁移该项目下的全部会话。 */
export function renameSessionProject(oldName: string, newName: string) {
  return http<void>('/claude-chat/sessions/projects/name', {
    method: 'PUT',
    body: JSON.stringify({ oldName, newName }),
  })
}

/** 收藏或取消收藏工具会话。 */
export function setSessionFavorite(id: string, favorite: boolean) {
  return http<void>(`/claude-chat/sessions/${encodeURIComponent(id)}/favorite`, {
    method: favorite ? 'PUT' : 'DELETE',
  })
}

/** 读取会话关联的快捷站点 ID。 */
export function listSessionSiteIds(id: string) {
  return http<string[]>(`/claude-chat/sessions/${encodeURIComponent(id)}/sites`)
}

/** 用完整列表替换会话关联的快捷站点。 */
export function replaceSessionSiteIds(id: string, siteIds: string[]) {
  return http<void>(`/claude-chat/sessions/${encodeURIComponent(id)}/sites`, {
    method: 'PUT',
    body: JSON.stringify({ siteIds }),
  })
}

/** 读取会话除主 cwd 外的附加项目目录。 */
export function listSessionProjectDirectories(id: string) {
  return http<string[]>(`/claude-chat/sessions/${encodeURIComponent(id)}/project-directories`)
}

/** 原子替换会话附加项目目录；目录必须来自项目工作台。 */
export function replaceSessionProjectDirectories(id: string, paths: string[]) {
  return http<void>(`/claude-chat/sessions/${encodeURIComponent(id)}/project-directories`, {
    method: 'PUT',
    body: JSON.stringify({ paths }),
  })
}

export type ReviewShareMode = 'SAFE_SNAPSHOT' | 'FULL_FORK'
export interface ReviewShareView {
  id: string
  sourceSessionId: string
  reviewSessionId: string
  mode: ReviewShareMode
  status: string
  title: string
  expiresAt: number
  createdAt: number
}

export interface ReviewFeedbackView {
  id: string
  reviewSpaceId: string
  sourceSessionId: string
  reviewSessionId: string
  content: string
  sourceMessageId: string | null
  status: 'PENDING' | 'CONSUMED' | 'DISMISSED'
  createdAt: number
  handledAt: number | null
}

export interface ReviewRelationContext {
  role: 'SOURCE' | 'REVIEW'
  sourceSessionId: string
  sourceTitle: string | null
  reviews: Array<ReviewShareView & { sourceTitle: string; reviewTitle: string }>
  pendingFeedback: ReviewFeedbackView[]
}

export function createReviewShare(sessionId: string, input: {
  mode: ReviewShareMode
  title?: string
  contextSnapshot?: string
  expiresInDays: number
  lastTurnId?: string
  codexHome?: string
}) {
  return http<{ review: ReviewShareView; token: string; sharePath: string; lanIpv4: string }>(
    `/claude-chat/sessions/${encodeURIComponent(sessionId)}/reviews`,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export function getPublicReview(token: string) {
  return fetch(`/api/claude-chat/reviews/public/${encodeURIComponent(token)}`).then(async response => {
    if (!response.ok) throw new Error(response.status === 404 ? '评审链接已失效、过期或被撤销' : '读取评审会话失败')
    return response.json() as Promise<{ reviewSessionId: string; title: string; sourceTitle: string; mode: ReviewShareMode; contextSnapshot: string; expiresAt: number; createdAt: number; runtimeConfig: { engine: 'codex'; modelPolicy: 'DEFAULT'; defaultModel: string | null; defaultReasoningEffort: string | null; speed: 'default'; executionPolicy: 'review-only'; codexAuthAlias: string } }>
  })
}

export function getReviewRelations(sessionId: string) {
  return http<ReviewRelationContext>(
    `/claude-chat/sessions/${encodeURIComponent(sessionId)}/review-relations`,
  )
}

export function handleReviewFeedback(id: string, status: 'CONSUMED' | 'DISMISSED') {
  return http<void>(`/claude-chat/review-feedback/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

export async function submitPublicReviewFeedback(token: string, content: string, sourceMessageId?: string) {
  const response = await fetch(`/api/claude-chat/reviews/public/${encodeURIComponent(token)}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, sourceMessageId }),
  })
  if (!response.ok) throw new Error(response.status === 404 ? '评审链接已失效' : '提交评审结论失败')
  return response.json() as Promise<{ id: string; status: string; createdAt: number }>
}

export async function uploadReviewAttachment(token: string, file: File): Promise<UploadedAttachment> {
  const fd = new FormData()
  fd.append('file', file)
  let response: Response
  try {
    response = await fetch(`/api/claude-chat/reviews/public/${encodeURIComponent(token)}/attachments`, {
      method: 'POST', body: fd, signal: AbortSignal.timeout(60_000),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') throw new Error('附件上传超时，请重试')
    throw new Error('附件上传失败，请检查网络后重试')
  }
  if (!response.ok) {
    if (response.status === 413) throw new Error('附件超过允许的单文件大小')
    if (response.status === 415) throw new Error('不支持该附件类型')
    if (response.status === 404) throw new Error('评审链接已失效')
    throw new Error(`附件上传失败（${response.status}）`)
  }
  return response.json()
}

/** 使用系统默认程序直接打开会话工作目录内的本地文件或目录。 */
export function openSessionLocalPath(sessionId: string, path: string) {
  return http<void>(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/open-local-path`, {
    method: 'POST',
    body: JSON.stringify({ path }),
  })
}

/** 读取会话关联的快捷站点和临时站点。 */
export function getSessionSiteConfiguration(id: string) {
  return http<SessionSiteConfiguration>(
    `/claude-chat/sessions/${encodeURIComponent(id)}/sites/configuration`,
  )
}

/** 原子替换会话关联的快捷站点和临时站点。 */
export function replaceSessionSiteConfiguration(id: string, configuration: SessionSiteConfiguration) {
  return http<void>(`/claude-chat/sessions/${encodeURIComponent(id)}/sites/configuration`, {
    method: 'PUT',
    body: JSON.stringify(configuration),
  })
}

/** 将空闲会话标记为规划过期。 */
export function expireSessionPlan(id: string) {
  return http<void>(`/claude-chat/sessions/${encodeURIComponent(id)}/plan-expired`, {
    method: 'PUT',
  })
}

/** 显式解除会话规划过期锁定。 */
export function unlockSessionPlan(id: string) {
  return http<void>(`/claude-chat/sessions/${encodeURIComponent(id)}/plan-expired`, {
    method: 'DELETE',
  })
}

/**
 * 跨会话答题：读取「非当前打开会话」的未决权限/提问请求详情（若有）。返回值与 WS 收到的
 * questionRequest/permissionRequest 同构（type 字段区分）。204 时 http() 返回 undefined。
 */
export function getPendingRequest(sessionId: string) {
  return http<ServerMessage | undefined>(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/pending`)
}

/**
 * 跨会话答题：提交对某会话未决请求的决策，不需要先把该会话切成当前打开的会话——
 * 配合 getPendingRequest，让提问弹窗能在任意模块自动弹出并直接作答。
 */
export function submitPendingDecision(sessionId: string, decision: {
  reqId: string
  behavior: 'allow' | 'deny'
  updatedInput?: Record<string, unknown>
  answers?: Record<string, string | string[]>
}) {
  return http<{ ok: boolean }>(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/pending/decision`, {
    method: 'POST',
    body: JSON.stringify(decision),
  })
}

/** 重命名本机历史会话（自定义别名；空串=清除，回落解析标题）。 */
export function renameHistory(sdkSessionId: string, alias: string) {
  return http<void>(`/claude-chat/history/${encodeURIComponent(sdkSessionId)}/alias`, {
    method: 'PUT',
    body: JSON.stringify({ alias }),
  })
}

/** 删除本机历史会话（移到回收目录，可恢复）。 */
export function deleteHistory(sdkSessionId: string, cwd: string) {
  const qs = cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''
  return http<void>(`/claude-chat/history/${encodeURIComponent(sdkSessionId)}${qs}`, {
    method: 'DELETE',
  })
}

/** 列出某 cwd 在磁盘上的 Claude Code 历史会话 */
export function listHistory(cwd: string) {
  const qs = cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''
  return http<HistorySessionView[]>(`/claude-chat/history${qs}`)
}

// ── 语音 / 附件：二进制 / multipart 传输，http() 的 JSON 封装不适用，改走 authFetch（仍带 JWT）──
async function errMessage(res: Response): Promise<string> {
  let msg = `HTTP ${res.status}`
  try {
    const j = await res.json()
    msg = (j && (j.message || j.error)) || msg
  } catch { /* 非 JSON */ }
  return msg
}

// ── 引擎本地用量 ───────────────────────────────────────────────
export interface UsageWindow {
  input: number; output: number; cacheRead: number; cacheCreate: number
  total: number; turns: number; sessions: number; cacheHitRate: number | null
}
export interface UsageQuota {
  primaryUsedPercent: number | null; primaryWindowMinutes: number | null; primaryResetsAt: number | null
  secondaryUsedPercent: number | null; secondaryWindowMinutes: number | null; secondaryResetsAt: number | null
  planType: string | null
  /** 相较上一次读数的百分点增量（最近一次 token 增量对应的窗口涨幅），可空 */
  primaryDeltaPercent?: number | null
  secondaryDeltaPercent?: number | null
}
export interface EngineUsage {
  engine: string; available: boolean; hasTokens: boolean; note: string | null
  today: UsageWindow; d7: UsageWindow; d30: UsageWindow; quota: UsageQuota | null
}

/** 拉三引擎本地用量（今日/近7天/近30天 + Codex 官方额度）。 */
export function fetchUsage(): Promise<EngineUsage[]> {
  return http<EngineUsage[]>('/claude-chat/usage')
}

/** 探测 faster-whisper ASR 是否就绪，用于启用/禁用麦克风按钮。 */
export async function sttAvailable(): Promise<boolean> {
  try {
    const res = await authFetch('/claude-chat/stt/available')
    if (!res.ok) return false
    const j = await res.json()
    return !!j.available
  } catch {
    return false
  }
}

/** 上传录音音频，返回转写文本。 */
export async function transcribe(audio: Blob, language = 'auto'): Promise<string> {
  // claude-chat 是 ADMIN-only：token 过期时软鉴权会回「200 + 空响应」而非 401，
  // 必须先主动续期，否则转写被静默拦成空文本（表现为「识别失败/无结果」）。
  await ensureFreshToken()
  if (!getToken()) throw new Error('未登录或登录已过期，请重新登录后再用语音')
  const res = await authFetch(`/claude-chat/stt?language=${encodeURIComponent(language)}`, {
    method: 'POST',
    headers: { 'Content-Type': audio.type || 'application/octet-stream' },
    body: audio,
  })
  if (!res.ok) throw new Error(await errMessage(res))
  const j = await res.json().catch(() => ({}))
  const text = (j?.text ?? '').trim()
  if (!text) {
    // 200 但空文本：要么登录态失效被软鉴权拦空，要么确实没识别到语音
    throw new Error(getToken() ? '没有识别到语音内容（请说话后再停止，或确认登录未过期）' : '登录已过期，请重新登录')
  }
  return text
}

/** 探测本地 Kokoro TTS 是否就绪；未就绪时语音模式回落到合成动画（AI 不出声）。 */
export async function ttsAvailable(): Promise<boolean> {
  try {
    const res = await authFetch('/claude-chat/tts/available')
    if (!res.ok) return false
    const j = await res.json()
    return !!j.available
  } catch {
    return false
  }
}

/** 合成语音：文本 → wav 字节（ArrayBuffer），供语音模式播放并驱动云团振幅。 */
export async function synthesize(text: string, voice?: string): Promise<ArrayBuffer> {
  const qs = voice ? `?voice=${encodeURIComponent(voice)}` : ''
  const res = await authFetch(`/claude-chat/tts${qs}`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: text,
  })
  if (!res.ok) throw new Error(await errMessage(res))
  return res.arrayBuffer()
}

export interface UploadedAttachment {
  id: string
  name: string
  mime: string
  size: number
  path: string
}

/** 上传单个附件，落盘到会话 cwd 专用目录，返回句柄。 */
export async function uploadAttachment(sessionId: string, file: File): Promise<UploadedAttachment> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await authFetch(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/attachments`, {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) throw new Error(await errMessage(res))
  return res.json()
}

export interface PersistedQueuedMessage {
  id: string
  sessionId: string
  text: string
  displayText?: string
  developerInstructions?: string
  attachments?: Array<{ name: string; path: string; mime?: string; url?: string }>
  createdAt: number
}

/** 恢复会话待发送队列；图片预览由已落盘路径重建，不依赖刷新后失效的 blob URL。 */
export async function listQueuedMessages(sessionId: string): Promise<PersistedQueuedMessage[]> {
  const messages = await http<PersistedQueuedMessage[]>(
    `/claude-chat/sessions/${encodeURIComponent(sessionId)}/queue`,
  )
  return messages.map(message => ({
    ...message,
    attachments: message.attachments?.map(attachment => ({
      ...attachment,
      url: attachment.mime?.startsWith('image/')
        ? `/api/claude-chat/attachments/file?path=${encodeURIComponent(attachment.path)}`
        : undefined,
    })),
  }))
}

export function saveQueuedMessage(sessionId: string, message: Omit<PersistedQueuedMessage, 'sessionId'>) {
  return http<PersistedQueuedMessage>(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/queue`, {
    method: 'POST',
    body: JSON.stringify({
      id: message.id,
      text: message.text,
      displayText: message.displayText,
      developerInstructions: message.developerInstructions,
      createdAt: message.createdAt,
      attachments: message.attachments?.map(({ name, mime, path }) => ({ name, mime, path })),
    }),
  })
}

export function deleteQueuedMessage(sessionId: string, messageId: string): Promise<void> {
  return http(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/queue/${encodeURIComponent(messageId)}`, {
    method: 'DELETE',
  })
}

export function clearQueuedMessages(sessionId: string): Promise<void> {
  return http(`/claude-chat/sessions/${encodeURIComponent(sessionId)}/queue`, { method: 'DELETE' })
}

// ── 历史会话消息分页加载 ──────────────────────────────────────────
export interface RawHistoryMessage {
  id: string
  kind: string
  text?: string
  forkAnchor?: string
  toolName?: string
  input?: unknown
  output?: string
  isError?: boolean
  stopReason?: string
  traceId?: string | null
  ts?: number | null
  usage?: Record<string, number> | null
  latencyMs?: number | null
  elapsedMs?: number | null
}

/** 分页读取某会话历史消息，转成渲染用 ChatItem。before 空=最近一页；否则取更早一页。 */
export async function loadMessages(
  sdkSessionId: string,
  cwd: string,
  before?: number | null,
  limit = 30,
): Promise<{ items: ChatItem[]; nextBefore: number | null }> {
  const qs = new URLSearchParams()
  if (cwd) qs.set('cwd', cwd)
  if (before != null) qs.set('before', String(before))
  qs.set('limit', String(limit))
  const page = await http<{ items: RawHistoryMessage[]; nextBefore: number | null }>(
    `/claude-chat/history/${encodeURIComponent(sdkSessionId)}/messages?${qs.toString()}`,
  )
  return { items: page.items.map(toChatItem), nextBefore: page.nextBefore }
}

export async function loadPublicReviewMessages(token: string, before?: number | null, limit = 30) {
  const qs = new URLSearchParams({ limit: String(limit) })
  if (before != null) qs.set('before', String(before))
  const response = await fetch(`/api/claude-chat/reviews/public/${encodeURIComponent(token)}/messages?${qs}`)
  if (!response.ok) throw new Error('读取评审历史失败')
  const page = await response.json() as { items: RawHistoryMessage[]; nextBefore: number | null }
  const items = page.items.map(toChatItem).map(item => {
    if (item.kind !== 'user' || !item.attachments) return item
    return {
      ...item,
      attachments: item.attachments.map(attachment => {
        if (!attachment.url) return attachment
        const encodedPath = attachment.url.split('path=')[1]
        return encodedPath ? { ...attachment, url: `/api/claude-chat/reviews/public/${encodeURIComponent(token)}/files?path=${encodedPath}` } : attachment
      }),
    }
  })
  return { items, nextBefore: page.nextBefore }
}

/** 图片扩展名列表，用于历史消息附件识别。 */
const IMAGE_EXTS = /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico)$/i

/**
 * 从用户消息文本中提取附件信息。
 * 后端 ClaudeChatService.appendAttachmentHints() 会在消息末尾追加：
 *   \n\n[附件] 用户上传了以下文件，需要时请用 Read 工具查看：
 *   \n- {name} → {path}
 *
 * 返回：去掉附件段的纯文本 + 附件列表（图片带后端 serve URL，文件只带 name/mime）。
 */
function parseAttachmentsFromText(raw: string): {
  displayText: string
  attachments: Array<{ name: string; mime?: string; url?: string }>
} {
  const MARKER = '\n\n[附件] 用户上传了以下文件，需要时请用 Read 工具查看：'
  const idx = raw.indexOf(MARKER)
  if (idx === -1) return { displayText: raw, attachments: [] }

  const displayText = raw.slice(0, idx).trim()
  const attSection = raw.slice(idx + MARKER.length)
  const attachments: Array<{ name: string; mime?: string; url?: string }> = []

  for (const line of attSection.split('\n')) {
    // 匹配 "- {name} → {path}"（→ 可能是全角也可能含空格）
    const match = line.match(/^-\s+(.+?)\s+(?:→|->)\s+(.+)$/)
    if (!match) continue
    const name = match[1].trim()
    const path = match[2].trim()
    if (!name || !path) continue
    const isImage = IMAGE_EXTS.test(name)
    const ext = name.split('.').pop()?.toLowerCase()
    const mime = isImage ? (ext === 'jpg' ? 'image/jpeg' : `image/${ext}`) : undefined
    // 图片通过后端 serve 端点显示原图；非图片只展示文件名卡片
    const url = isImage ? `/api/claude-chat/attachments/file?path=${encodeURIComponent(path)}` : undefined
    attachments.push({ name, mime, url })
  }

  return { displayText, attachments }
}

function toChatItem(m: RawHistoryMessage): ChatItem {
  const ts = m.ts ?? undefined
  switch (m.kind) {
    case 'assistant':
      return { kind: 'assistant', id: m.id, text: m.text ?? '', forkAnchor: m.forkAnchor, ts }
    case 'tool':
      return { kind: 'tool', id: m.id, toolName: m.toolName ?? '', input: m.input ?? null, output: m.output ?? undefined, isError: m.isError ?? undefined, ts, elapsedMs: m.elapsedMs ?? undefined }
    case 'result':
      return { kind: 'result', id: m.id, stopReason: m.stopReason ?? 'end_turn', traceId: m.traceId, ts, usage: m.usage ?? undefined, latencyMs: m.latencyMs ?? undefined }
    default: {
      // 用户消息：解析附件段，剥离出纯展示文本 + 附件列表
      const parsed = parseAttachmentsFromText(m.text ?? '')
      const displayText = normalizeUserMessageForDisplay(parsed.displayText)
      return {
        kind: 'user',
        id: m.id,
        text: displayText,
        ts,
        attachments: parsed.attachments.length > 0 ? parsed.attachments : undefined,
      }
    }
  }
}
