import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Network, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { engineName, type Engine } from '@/features/claude-chat/public-api'
import { CHAT_ROUTE } from '@/features/claude-chat/public-api/runtime'
import { GRAPHIFY_LABEL, GRAPHIFY_TONE, graphifyStatus, type ProjectStatusSnapshot } from '@/features/knowledge-graph/public-api'
import { navigateWithLaunchIntent } from '@/shell/launch-intent/api'
import { ProjectKnowledgeEntry } from './ProjectKnowledgeEntry'

/** Graphify 按需检测，业务与拓扑探索复用项目库入口；折叠不扫描目录。 */
export function KnowledgeGraphCard({ projectPath, snapshot }: {
  projectPath: string; projectName: string; snapshot?: ProjectStatusSnapshot
}) {
  const navigate = useNavigate()
  const confirm = useConfirm()
  const cache = useQueryClient()
  const [expanded, setExpanded] = useState(false)
  const [showKnowledge, setShowKnowledge] = useState(false)
  const [engine, setEngine] = useState<Engine>('codex')
  const [launchError, setLaunchError] = useState<string | null>(null)
  useEffect(() => { setExpanded(false); setShowKnowledge(false); setLaunchError(null) }, [projectPath])
  const graph = useQuery({ queryKey: ['kg-graphify-status', projectPath],
    queryFn: ({ signal }) => graphifyStatus(projectPath, signal), enabled: false,
    staleTime: 60_000, retry: false, refetchOnWindowFocus: false,
  })
  const state = graph.data?.state ?? snapshot?.graphifyState
  const toggle = () => {
    if (expanded) void cache.cancelQueries({ queryKey: ['kg-graphify-status', projectPath], exact: true })
    setExpanded(value => !value)
  }
  const launch = async (mode: 'full' | 'update') => {
    const ok = await confirm({ title: mode === 'full' ? '生成 Graphify 图谱' : '更新 Graphify 图谱',
      description: '将打开 AI 会话，在当前项目运行 Graphify。按项目规模可能需要数分钟，产物保存在项目目录。', confirmText: '开始' })
    if (!ok) return
    setLaunchError(null)
    try { await navigateWithLaunchIntent(navigate, CHAT_ROUTE, { type: 'CHAT_OPEN_AND_SEND', cwd: projectPath,
      seed: mode === 'full' ? '/graphify' : '/graphify --update', engine }) }
    catch (error) { setLaunchError(error instanceof Error ? error.message : '无法创建 Graphify 任务，请重试') }
  }
  return <section className="border-y border-[var(--color-border)]" aria-label="项目知识">
    <div className="flex flex-wrap items-center justify-between gap-3 py-5">
      <button type="button" onClick={toggle} aria-expanded={expanded} className="flex items-center gap-2 text-left font-semibold">
        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}<Network className="size-4" />知识图谱</button>
      <StatusBadge tone={state ? GRAPHIFY_TONE[state] : 'neutral'}>Graphify · {state ? GRAPHIFY_LABEL[state] : '未检测'}</StatusBadge>
    </div>
    {expanded && <div className="space-y-8 border-t border-[var(--color-border)] py-6">
      <section className="space-y-4"><div className="space-y-1"><h3 className="font-medium">Graphify · 代码结构</h3>
        <p className="text-sm leading-6 text-[var(--color-muted-foreground)]">为业务知识和跨项目关系提供代码定位证据。</p></div>
        <p className="text-xs text-[var(--color-muted-foreground)]">{graph.data ? `检测于 ${new Date(graph.data.checkedAt).toLocaleString()}` : snapshot ? `历史检测于 ${new Date(snapshot.checkedAt).toLocaleString()}，尚未实时检查` : '尚未检测。展开不会自动扫描项目。'}</p>
        <div className="flex flex-wrap items-center gap-3"><Button size="sm" variant="outline" disabled={graph.isFetching} onClick={() => void graph.refetch()}>
          <RefreshCw className={graph.isFetching ? 'size-4 animate-spin' : 'size-4'} />{graph.isFetching ? '正在检测，可收起取消' : '检查最新状态'}</Button>
          {graph.data && <><label className="flex items-center gap-2 text-xs">图谱执行引擎<select aria-label="图谱执行引擎" className="h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-2" value={engine} onChange={event => setEngine(event.target.value as Engine)}>
            {(['codex', 'claude', 'antigravity', 'opencode'] as Engine[]).map(item => <option key={item} value={item}>{engineName(item)}</option>)}</select></label>
            <Button size="sm" variant="outline" onClick={() => void launch(graph.data.state === 'STALE' ? 'update' : 'full')}>
              {graph.data.state === 'NOT_GENERATED' ? '一键生成' : graph.data.state === 'STALE' ? '更新' : '强制重新生成'}</Button></>}
        </div>
        {graph.error && <p className="text-sm text-[var(--color-destructive)]">{graph.error.message}</p>}
        {launchError && <p role="alert" className="text-sm text-[var(--color-destructive)]">{launchError}</p>}
      </section>
      <section className="space-y-4 border-t border-[var(--color-border)] pt-6"><h3 className="font-medium">业务知识与跨项目关系</h3>
        <p className="max-w-3xl text-sm leading-6 text-[var(--color-muted-foreground)]">在项目库统一探索、查看证据和核对新鲜度。已有知识和评审记录继续保留，无需分别初始化两个知识仓库。</p>
        <Button variant="outline" size="sm" aria-expanded={showKnowledge} onClick={() => setShowKnowledge(value => !value)}>{showKnowledge ? '收起知识探索' : '探索知识'}</Button>
        {showKnowledge && <ProjectKnowledgeEntry key={projectPath} projectPath={projectPath} />}
      </section>
    </div>}
  </section>
}
