import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import type { SystemRouteInspection } from './types'

const labels: Record<string, string> = { HEALTHY: '访问链路完整', DEGRADED: '部分能力缺失', UNVERIFIED: '运行态待核验', BROKEN: '访问链路中断', PASS: '通过', WARNING: '需关注', FAIL: '失败' }
function tone(value: string): StatusTone {
  if (value === 'HEALTHY' || value === 'PASS') return 'success'
  if (value === 'BROKEN' || value === 'FAIL') return 'danger'
  return value === 'UNVERIFIED' ? 'info' : 'warning'
}

export function DiagnosticResults({ result, module }: { result: SystemRouteInspection; module: string }) {
  const modules = (module ? result.route?.matchedModules : result.route?.modules) ?? []
  const scope = result.route ? [result.route.evidenceScope.primary, ...result.route.evidenceScope.relatedProjects] : []
  return <section className="space-y-6" aria-label="上下文诊断结果">
    <div className="flex flex-wrap items-center gap-3"><h3 className="text-base font-semibold">诊断结果</h3><StatusBadge tone={tone(result.overallStatus)}>{labels[result.overallStatus]}</StatusBadge></div>
    <p className="text-sm leading-6">{result.summary}</p>
    <div className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]">{result.checks.map(check => <article key={check.code} className="grid gap-3 py-4 md:grid-cols-[100px_minmax(0,1fr)]">
      <div><StatusBadge tone={tone(check.status)}>{labels[check.status]}</StatusBadge></div>
      <div className="min-w-0"><h4 className="text-sm font-medium">{check.title}</h4><p className="mt-1 text-sm leading-6 text-[var(--color-muted-foreground)]">{check.explanation}</p>
        {check.recoveryAction && <p className="mt-2 text-sm leading-6">下一步：{check.recoveryAction}</p>}
        {check.evidence && <p className="mt-2 break-all text-xs leading-5 text-[var(--color-muted-foreground)]">{check.evidence}</p>}</div>
    </article>)}</div>
    <details className="border-b border-[var(--color-border)] pb-5"><summary className="cursor-pointer text-sm font-medium">查看代码坐标、证据范围与工具明细</summary>
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <EvidenceList title={`模块代码坐标 · ${modules.length} 项`} items={modules.slice(0, 12).map(item => `${item.name} · ${item.codePath || item.webPaths.join(', ') || '尚未配置代码路径'}`)} empty="没有匹配模块，请核对模块名称或知识定义。" />
        <EvidenceList title="页面 URL 定位" items={result.route?.urlRouteMatches ?? []} empty="暂无 URL 定位证据，可填写页面地址后重试。" />
        <EvidenceList title="证据项目范围" items={scope.map(item => `${item.projectKey} · ${item.relation} · ${item.projectPath || '未绑定源码'}`)} empty="尚未确定证据范围，请先完成源码绑定。" />
        <EvidenceList title="运行时 MCP 工具" items={result.runtimeTools.tools.map(item => `${item.server} / ${item.tool}`)} empty="没有可用的运行时工具，请检查 Agent 服务状态。" />
        <EvidenceList title="关联 Forge 工具" items={result.menuTools.map(item => `${item.name} · ${item.route}`)} empty="未匹配到关联工具。" />
      </div>
    </details>
  </section>
}

function EvidenceList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <section className="min-w-0"><h4 className="text-sm font-medium">{title}</h4>{items.length
    ? <ul className="mt-3 space-y-2 text-xs leading-5 text-[var(--color-muted-foreground)]">{items.map((item, index) => <li key={`${index}:${item}`} className="break-all">{item}</li>)}</ul>
    : <p className="mt-3 text-xs leading-5 text-[var(--color-muted-foreground)]">{empty}</p>}</section>
}
