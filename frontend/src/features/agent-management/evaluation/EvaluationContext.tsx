import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getAgent } from '../api'
import { agentDetailHref, evaluationHref } from '../navigation'

export function EvaluationContext() {
  const [params] = useSearchParams()
  const agentId = params.get('agent') || ''
  const agent = useQuery({
    queryKey: ['agent-management', agentId],
    queryFn: () => getAgent(agentId),
    enabled: !!agentId,
  })
  if (!agentId) return null
  return <section aria-label="评测来源" className="border-b pb-4 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p>来自 <span className="font-medium">{agent.data?.name || agentId}</span></p>
      <div className="flex flex-wrap gap-4">
        <Link className="underline underline-offset-4" to={agentDetailHref(agentId)}>返回 Agent 详情</Link>
        <Link className="underline underline-offset-4" to={evaluationHref()}>查看全部评测</Link>
      </div>
    </div>
    <p className="mt-2 text-xs leading-5 text-[var(--color-muted-foreground)]">
      此处运行题集回归，尚不验证候选版本的完整配置；结果不会自动改变发布门禁。
    </p>
  </section>
}
