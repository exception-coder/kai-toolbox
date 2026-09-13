import type { OpenSpecChangeDetail } from '../types'

const labels: Record<string, string> = { proposal: '需求提案', design: '技术设计', specs: '行为规格', tasks: '任务清单' }
const states: Record<string, string> = { done: '已具备', ready: '待补充', blocked: '缺少前置材料', skipped: '已跳过' }

export function PlanningStatus({ workflow }: { workflow: OpenSpecChangeDetail['workflow'] }) {
  const missing = [...new Set([...(workflow?.missingArtifacts ?? []), ...(workflow?.missingPrerequisites ?? [])])]
  return <section className="mt-6 border-t border-[var(--color-border)] pt-4" aria-label="材料准备情况">
    <h3 className="text-xs font-semibold">材料准备情况</h3>
    {!workflow || workflow.artifacts.length === 0 ? <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">查询尚未返回材料状态，请刷新后查看。</p> : <dl className="mt-3 space-y-3 text-xs">
      {workflow.artifacts.map(artifact => <div key={artifact.id}>
        <div className="flex justify-between gap-3"><dt>{labels[artifact.id] ?? artifact.id}</dt><dd>{states[artifact.status] ?? '状态未知'}</dd></div>
        {artifact.missingDeps.length > 0 && <p className="mt-1 text-[var(--color-muted-foreground)]">还缺：{artifact.missingDeps.map(id => labels[id] ?? id).join('、')}</p>}
      </div>)}
    </dl>}
    {missing.length > 0 && <p className="mt-3 text-xs leading-5">实施前还需补充：{missing.map(id => labels[id] ?? id).join('、')}</p>}
    {workflow?.state === 'blocked' && <p className="mt-3 text-xs">OpenSpec 提示当前尚不能开始实施。</p>}
    <p className="mt-3 text-xs leading-5 text-[var(--color-muted-foreground)]">材料齐全表示可以继续实施，不代表构建、测试或运行验收通过。</p>
  </section>
}
