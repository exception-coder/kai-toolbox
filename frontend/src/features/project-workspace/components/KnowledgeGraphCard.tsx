import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Network, Play, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  EngineIcon,
  engineName,
  type Engine,
} from '@/features/claude-chat/public-api'
import { CHAT_ROUTE } from '@/features/claude-chat/public-api/runtime'
import {
  crossTopologyStatus,
  domainKnowledgeStatus,
  DomainKnowledgeCard,
  GRAPHIFY_LABEL,
  GRAPHIFY_TONE,
  graphifyStatus,
  REGISTRATION_LABEL,
  REGISTRATION_TONE,
  repoPaths,
  type ProjectStatusSnapshot,
  type RegistrationState,
} from '@/features/knowledge-graph/public-api'
import { navigateWithLaunchIntent } from '@/shell/launch-intent/api'

/**
 * Graphify 的生成不是一条确定性 CLI 命令——`/graphify` 是一个 Claude Code skill，内部会做
 * AST 解析 + 语义抽取子 Agent + 社区检测打标（见 `~/.claude/skills/graphify/SKILL.md`），
 * 必须在 AI 会话里跑，不能后端直接 shell out。`--update` 对应"已生成但过时"场景的增量重建。
 */
function buildGraphifySeed(mode: 'full' | 'update'): string {
  return mode === 'full' ? '/graphify' : '/graphify --update'
}

function buildBootstrapSeed(
  repoKey: 'domain-knowledge' | 'cross-topology',
  projectPath: string,
  projectKey: string,
  scope: 'full' | string[],
): string {
  const scopeText = scope === 'full' ? '全部模块' : `以下模块：${scope.join('、')}`
  if (repoKey === 'cross-topology') {
    return [
      `为 cross-project-topology 初始化或更新生态 "${projectKey}" 的跨项目拓扑。`,
      `当前项目根路径：${projectPath}`,
      `目标生态 key：${projectKey}`,
      `本次范围：${scopeText}`,
      '',
      '这是跨项目拓扑任务，不要调用 domain-knowledge-bootstrap，也不要生成 formula/flow/state/rule/concept/term 六类业务真理。',
      '先以当前项目为锚点识别至少一个真实关联项目；若无法确认跨项目关系，先向我提问，不要把单项目内部知识写入本库。',
      `产物只写入当前 cross-project-topology 仓库的 knowledge/${projectKey}/ 下，按 call-chains、data-flows、api-contracts、service-maps 四类目录归档。`,
      '每条 Markdown 必须包含 id、project、module、title、type、stability、summary frontmatter，其中 stability 保持 draft。',
      '完成后更新 INDEX.md，校验路径与 frontmatter，并调用 cross-topology MCP reload_knowledge 使其生效。',
    ].join('\n')
  }
  return [
    `用 domain-knowledge-bootstrap skill 为项目 "${projectKey}" 起草业务真理知识点。`,
    `目标项目根路径：${projectPath}`,
    `目标项目 key：${projectKey}`,
    `本次范围：${scopeText}`,
    '',
    '请按阶段A（如目标项目尚无 CLAUDE.md）+ 阶段B（逐模块 scan → 起草 draft → 人工确认边界）走，',
    '产出全部保持 stability: draft，不要擅自升级为 stable。',
    '全部起草完成后跑 check + check-paths + npm run catalog，并调用 MCP reload_knowledge 使其生效。',
  ].join('\n')
}

/** 折叠态徽标：优先用批量检测缓存（无请求），缓存未命中时回落"未检测"。 */
function CollapsedBadges({ snapshot }: { snapshot?: ProjectStatusSnapshot }) {
  const graphifyState = snapshot?.graphifyState
  const businessState = snapshot?.businessGraphState
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <StatusBadge tone={graphifyState ? GRAPHIFY_TONE[graphifyState] : 'neutral'}>
        Graphify · {graphifyState ? GRAPHIFY_LABEL[graphifyState] : '未检测'}
      </StatusBadge>
      <StatusBadge tone={businessState ? REGISTRATION_TONE[businessState] : 'neutral'}>
        业务图谱 · {businessState ? REGISTRATION_LABEL[businessState] : '未检测'}
      </StatusBadge>
    </div>
  )
}

function aggregateRegistrationState(
  domainState: RegistrationState,
  crossTopologyState: RegistrationState,
): RegistrationState {
  const rank: Record<RegistrationState, number> = {
    NOT_REGISTERED: 0,
    PARTIAL: 1,
    REGISTERED: 2,
  }
  return rank[domainState] <= rank[crossTopologyState] ? domainState : crossTopologyState
}

/**
 * 项目工作台内嵌的知识图谱卡片：默认折叠只显示两个状态徽标（读批量检测缓存，不发请求）；
 * 展开只读已有状态；Graphify 按需检测，两类业务知识在各自展开时检测。
 * 收起时取消客户端请求，避免页面操作隐式重复扫描项目。
 */
export function KnowledgeGraphCard({
  projectPath,
  projectName,
  snapshot,
}: {
  projectPath: string
  projectName: string
  snapshot?: ProjectStatusSnapshot
}) {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [checking, setChecking] = useState(false)
  const [domainExpanded, setDomainExpanded] = useState(false)
  const [crossTopologyExpanded, setCrossTopologyExpanded] = useState(false)
  const [bootstrapEngine, setBootstrapEngine] = useState<Engine | null>(null)
  const [selectedGaps, setSelectedGaps] = useState<Record<string, Set<string>>>({})
  const [launchError, setLaunchError] = useState<string | null>(null)

  useEffect(() => {
    setExpanded(false)
    setChecking(false)
    setDomainExpanded(false)
    setCrossTopologyExpanded(false)
    setSelectedGaps({})
  }, [projectPath])

  const graphifyQuery = useQuery({
    queryKey: ['kg-graphify-status', projectPath],
    queryFn: ({ signal }) => graphifyStatus(projectPath, signal),
    enabled: expanded && checking,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const domainKnowledgeQuery = useQuery({
    queryKey: ['kg-domain-knowledge-status', projectPath],
    queryFn: ({ signal }) => domainKnowledgeStatus(projectPath, signal),
    enabled: expanded && domainExpanded,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const crossTopologyQuery = useQuery({
    queryKey: ['kg-cross-topology-status', projectPath],
    queryFn: ({ signal }) => crossTopologyStatus(projectPath, signal),
    enabled: expanded && crossTopologyExpanded,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  })

  const toggleExpanded = () => {
    if (expanded) {
      setChecking(false)
      setDomainExpanded(false)
      setCrossTopologyExpanded(false)
      for (const key of ['kg-graphify-status', 'kg-domain-knowledge-status', 'kg-cross-topology-status']) {
        void queryClient.cancelQueries({ queryKey: [key, projectPath], exact: true })
      }
    }
    setExpanded(value => !value)
  }
  const currentGraphify = graphifyQuery.data
  const graphifyState = currentGraphify?.state ?? snapshot?.graphifyState
  const visibleSnapshot = currentGraphify ? { projectPath, graphifyState: currentGraphify.state,
    businessGraphState: snapshot?.businessGraphState ?? null, businessGraphError: snapshot?.businessGraphError ?? null,
    checkedAt: currentGraphify.checkedAt } : snapshot

  useEffect(() => {
    const graphify = graphifyQuery.data
    const domain = domainKnowledgeQuery.data
    const crossTopology = crossTopologyQuery.data
    if (!graphify || !domain || !crossTopology) return

    const checkedAt = [graphify.checkedAt, domain.checkedAt, crossTopology.checkedAt]
      .sort()
      .at(-1) ?? new Date().toISOString()
    queryClient.setQueryData<Record<string, ProjectStatusSnapshot>>(['kg-status-cache'], (previous) => ({
      ...(previous ?? {}),
      [projectPath]: {
        projectPath,
        graphifyState: graphify.state,
        businessGraphState: aggregateRegistrationState(domain.state, crossTopology.state),
        businessGraphError: null,
        checkedAt,
      },
    }))
  }, [
    crossTopologyQuery.data,
    domainKnowledgeQuery.data,
    graphifyQuery.data,
    projectPath,
    queryClient,
  ])

  const launchBootstrap = async (repoKey: 'domain-knowledge' | 'cross-topology', scope: 'full' | string[], label: string) => {
    if (!bootstrapEngine) {
      await confirm({
        title: '请选择执行引擎',
        description: '初始化和更新知识图谱前，需要先明确选择本次使用的 AI 引擎。',
        confirmText: '知道了',
        cancelText: '关闭',
      })
      return
    }
    let repos: Awaited<ReturnType<typeof repoPaths>>
    try {
      repos = await queryClient.fetchQuery({ queryKey: ['kg-repo-paths'], queryFn: repoPaths, staleTime: 60_000 })
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : '无法读取团队仓库目录，请重试')
      return
    }
    const cwd = repoKey === 'domain-knowledge' ? repos.domainKnowledgeRepoPath : repos.crossTopologyRepoPath
    if (!cwd) {
      await confirm({
        title: '团队依赖尚未初始化',
        description: `请先在 Vibe Coding 拉取 ${repoKey === 'domain-knowledge' ? 'project-domain-knowledge' : 'cross-project-topology'}，再回来重试。`,
        confirmText: '知道了',
        cancelText: '关闭',
      })
      return
    }
    const ok = await confirm({
      title: label,
      description: '将跳转到 Vibe Coding 打开一个 AI 会话执行，耗时可能数分钟到数十分钟，产出全部为 draft，需人工 review。',
      confirmText: '确认跳转',
    })
    if (!ok) return
    const seed = buildBootstrapSeed(repoKey, projectPath, projectName, scope)
    setLaunchError(null)
    try {
      await navigateWithLaunchIntent(navigate, CHAT_ROUTE, {
        type: 'CHAT_OPEN_AND_SEND',
        cwd,
        seed,
        engine: bootstrapEngine,
      })
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : '无法创建知识图谱任务交接')
    }
  }

  const launchGraphifyGeneration = async (mode: 'full' | 'update') => {
    const ok = await confirm({
      title: mode === 'full' ? '一键生成 Graphify 图谱' : '更新 Graphify 图谱',
      description: '将跳转到 Vibe Coding，在该项目目录下运行 /graphify skill——这是一套 Agent 编排流程'
        + '（AST 解析 + 语义抽取子 Agent + 社区检测打标），不是简单命令，项目越大耗时越久（几分钟到数十分钟不等）。'
        + '产物写入项目自己的 graphify-out/ 目录。',
      confirmText: '确认跳转',
    })
    if (!ok) return
    const seed = buildGraphifySeed(mode)
    setLaunchError(null)
    try {
      await navigateWithLaunchIntent(navigate, CHAT_ROUTE, {
        type: 'CHAT_OPEN_AND_SEND',
        cwd: projectPath,
        seed,
        engine: bootstrapEngine ?? 'claude',
      })
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : '无法创建 Graphify 任务交接')
    }
  }

  const toggleGap = (repoKey: string, moduleKey: string) => {
    setSelectedGaps((prev) => {
      const set = new Set(prev[repoKey] ?? [])
      if (set.has(moduleKey)) set.delete(moduleKey)
      else set.add(moduleKey)
      return { ...prev, [repoKey]: set }
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 text-left"
          onClick={toggleExpanded}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <Network className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
          <CardTitle className="text-base">知识图谱</CardTitle>
        </button>
        <CollapsedBadges snapshot={visibleSnapshot} />
      </CardHeader>
      {expanded && (
        <CardContent className="flex flex-col gap-4 border-t pt-4">
          {launchError && (
            <p className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">
              {launchError}
            </p>
          )}
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/20 p-3">
            <div className="mb-2 text-xs font-medium text-[var(--color-foreground)]">初始化 / 更新执行引擎（必选）</div>
            <div className="flex flex-wrap gap-2">
              {(['claude', 'codex', 'antigravity', 'opencode'] as Engine[]).map(engine => (
                <Button
                  key={engine}
                  type="button"
                  size="sm"
                  variant={bootstrapEngine === engine ? 'default' : 'outline'}
                  onClick={() => setBootstrapEngine(engine)}
                  aria-pressed={bootstrapEngine === engine}
                >
                  <EngineIcon engine={engine} className="size-3.5" />
                  {engineName(engine)}
                </Button>
              ))}
            </div>
          </div>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Graphify（代码结构图）</CardTitle>
                <CardDescription>产物在项目自己目录 graphify-out/ 下</CardDescription>
              </div>
              {graphifyState && (
                <StatusBadge tone={GRAPHIFY_TONE[graphifyState]}>
                  {GRAPHIFY_LABEL[graphifyState]}
                </StatusBadge>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-[var(--color-muted-foreground)]">
              <p className="text-xs">{currentGraphify ? `检测于 ${new Date(currentGraphify.checkedAt).toLocaleString()}` : snapshot ? `历史检测于 ${new Date(snapshot.checkedAt).toLocaleString()}，尚未实时检查` : '尚未检测。展开不会自动扫描项目。'}</p>
              <Button size="sm" variant="outline" disabled={graphifyQuery.isFetching} onClick={() => { setChecking(true); void graphifyQuery.refetch() }}>
                <RefreshCw className={graphifyQuery.isFetching ? 'size-4 animate-spin' : 'size-4'} />{graphifyQuery.isFetching ? '正在检测，可收起取消' : '检查最新状态'}
              </Button>
              {graphifyQuery.isError && <span className="text-[var(--color-destructive)]">{(graphifyQuery.error as Error).message}</span>}
              {graphifyQuery.data && (
                <>
                  {graphifyQuery.data.latestCommitAt && (
                    <p>项目最新提交：{new Date(graphifyQuery.data.latestCommitAt).toLocaleString()}</p>
                  )}
                  {graphifyQuery.data.state === 'NOT_GENERATED' && (
                    <Button onClick={() => launchGraphifyGeneration('full')}>
                      <Play className="size-4" />一键生成
                    </Button>
                  )}
                  {graphifyQuery.data.state === 'STALE' && (
                    <Button onClick={() => launchGraphifyGeneration('update')}>
                      <RefreshCw className="size-4" />更新
                    </Button>
                  )}
                  {graphifyQuery.data.state === 'UP_TO_DATE' && (
                    <Button variant="outline" onClick={() => launchGraphifyGeneration('full')}>
                      <RefreshCw className="size-4" />强制重新生成
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <DomainKnowledgeCard
            title="domain-knowledge（业务真理）"
            description="集中式仓库，按项目 key 归档"
            repoKey="domain-knowledge"
            query={domainKnowledgeQuery}
            expanded={domainExpanded}
            onExpandedChange={setDomainExpanded}
            selected={selectedGaps['domain-knowledge'] ?? new Set()}
            onToggle={(k) => toggleGap('domain-knowledge', k)}
            onLaunch={(scope) => launchBootstrap('domain-knowledge', scope, scope === 'full' ? '一键初始化 domain-knowledge' : '更新 domain-knowledge')}
          />

          <DomainKnowledgeCard
            title="cross-topology（跨项目拓扑）"
            description="集中式仓库；生态/单项目粒度尚待确认，见设计文档"
            repoKey="cross-topology"
            query={crossTopologyQuery}
            expanded={crossTopologyExpanded}
            onExpandedChange={setCrossTopologyExpanded}
            selected={selectedGaps['cross-topology'] ?? new Set()}
            onToggle={(k) => toggleGap('cross-topology', k)}
            onLaunch={(scope) => launchBootstrap('cross-topology', scope, scope === 'full' ? '一键初始化 cross-topology' : '更新 cross-topology')}
          />
        </CardContent>
      )}
    </Card>
  )
}
