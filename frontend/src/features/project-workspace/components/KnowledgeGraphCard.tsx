import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Network } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { CHAT_ROUTE } from '@/features/claude-chat/runtime/ChatRuntimeContext'
import { crossTopologyStatus, domainKnowledgeStatus, graphifyStatus, repoPaths } from '@/features/knowledge-graph/api'
import {
  DomainKnowledgeCard,
  GRAPHIFY_LABEL,
  GRAPHIFY_TONE,
  REGISTRATION_LABEL,
  REGISTRATION_TONE,
} from '@/features/knowledge-graph/components/DomainKnowledgeCard'
import type { ProjectStatusSnapshot } from '@/features/knowledge-graph/types'

const LAUNCH_KEY = 'kai-toolbox:claude-chat:knowledge-graph-bootstrap-launch'

function buildBootstrapSeed(projectPath: string, projectKey: string, scope: 'full' | string[]): string {
  const scopeText = scope === 'full' ? '全部模块' : `以下模块：${scope.join('、')}`
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

/**
 * 项目工作台内嵌的知识图谱卡片：默认折叠只显示两个状态徽标（读批量检测缓存，不发请求）；
 * 展开后对当前选中项目发起三项实时检测（Graphify/domain-knowledge/cross-topology），
 * 与原独立页面内容一致，只是 path/projectKey 直接取选中项目，无需手填。
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
  const [expanded, setExpanded] = useState(false)
  const [selectedGaps, setSelectedGaps] = useState<Record<string, Set<string>>>({})

  const { data: repos } = useQuery({ queryKey: ['kg-repo-paths'], queryFn: repoPaths, staleTime: 60_000, enabled: expanded })
  const graphifyQuery = useQuery({
    queryKey: ['kg-graphify-status', projectPath],
    queryFn: () => graphifyStatus(projectPath),
    enabled: expanded,
  })
  const domainKnowledgeQuery = useQuery({
    queryKey: ['kg-domain-knowledge-status', projectPath],
    queryFn: () => domainKnowledgeStatus(projectPath),
    enabled: expanded,
  })
  const crossTopologyQuery = useQuery({
    queryKey: ['kg-cross-topology-status', projectPath],
    queryFn: () => crossTopologyStatus(projectPath),
    enabled: expanded,
  })

  const launchBootstrap = async (repoKey: 'domain-knowledge' | 'cross-topology', scope: 'full' | string[], label: string) => {
    const cwd = repoKey === 'domain-knowledge' ? repos?.domainKnowledgeRepoPath : repos?.crossTopologyRepoPath
    if (!cwd) {
      const goConfig = await confirm({
        title: '尚未配置仓库路径',
        description: `请先在配置中心设置 ${repoKey === 'domain-knowledge' ? 'domain-knowledge-repo-path' : 'cross-topology-repo-path'}，再回来重试。`,
        confirmText: '去配置 →',
      })
      if (goConfig) navigate('/tools/config-center?block=toolbox.knowledge-graph')
      return
    }
    const ok = await confirm({
      title: label,
      description: '将跳转到 Vibe Coding 打开一个 AI 会话执行，耗时可能数分钟到数十分钟，产出全部为 draft，需人工 review。',
      confirmText: '确认跳转',
    })
    if (!ok) return
    const seed = buildBootstrapSeed(projectPath, projectName, scope)
    try { sessionStorage.setItem(LAUNCH_KEY, JSON.stringify({ cwd, seed })) } catch { /* 隐私模式忽略 */ }
    navigate(CHAT_ROUTE)
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
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <Network className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />
          <CardTitle className="text-base">知识图谱</CardTitle>
        </button>
        <CollapsedBadges snapshot={snapshot} />
      </CardHeader>
      {expanded && (
        <CardContent className="flex flex-col gap-4 border-t pt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Graphify（代码结构图）</CardTitle>
                <CardDescription>产物在项目自己目录 graphify-out/ 下</CardDescription>
              </div>
              {graphifyQuery.data && (
                <StatusBadge tone={GRAPHIFY_TONE[graphifyQuery.data.state]}>
                  {GRAPHIFY_LABEL[graphifyQuery.data.state]}
                </StatusBadge>
              )}
            </CardHeader>
            <CardContent className="text-sm text-[var(--color-muted-foreground)]">
              {graphifyQuery.isLoading && '检测中…'}
              {graphifyQuery.isError && <span className="text-[var(--color-destructive)]">{(graphifyQuery.error as Error).message}</span>}
              {graphifyQuery.data && (
                <>
                  <p>安装/生成触发暂未实现（另行开发），此处仅展示检测结果。</p>
                  {graphifyQuery.data.latestCommitAt && (
                    <p className="mt-1">项目最新提交：{new Date(graphifyQuery.data.latestCommitAt).toLocaleString()}</p>
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
            selected={selectedGaps['domain-knowledge'] ?? new Set()}
            onToggle={(k) => toggleGap('domain-knowledge', k)}
            onLaunch={(scope) => launchBootstrap('domain-knowledge', scope, scope === 'full' ? '一键初始化 domain-knowledge' : '更新 domain-knowledge')}
          />

          <DomainKnowledgeCard
            title="cross-topology（跨项目拓扑）"
            description="集中式仓库；生态/单项目粒度尚待确认，见设计文档"
            repoKey="cross-topology"
            query={crossTopologyQuery}
            selected={selectedGaps['cross-topology'] ?? new Set()}
            onToggle={(k) => toggleGap('cross-topology', k)}
            onLaunch={(scope) => launchBootstrap('cross-topology', scope, scope === 'full' ? '一键初始化 cross-topology' : '更新 cross-topology')}
          />
        </CardContent>
      )}
    </Card>
  )
}
