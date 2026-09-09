import { Check, Loader2 } from 'lucide-react'
import type { InitRun, ProfileAsset, SystemProfile } from './types'
import { assetTitle, explainProfileMessage, stageDescriptions } from './profileLabels'

export function InitializationProgress({ run }: { run: InitRun }) {
  return <section className="space-y-4" aria-label="初始化进度" aria-live="polite">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-base font-semibold">{run.mode === 'FULL' ? '完整初始化（Full Init）' : '手动同步'} <span className="ml-2 text-sm font-normal text-[var(--color-muted-foreground)]">{run.state === 'RUNNING' ? '正在执行' : run.state === 'FAILED' ? '执行失败' : '已完成'}</span></h2>
      <span className="text-xs text-[var(--color-muted-foreground)]">{new Date(run.startedAt).toLocaleString()}</span></div>
    <ol className="divide-y divide-[var(--color-border)]">{run.stages.map((stage, index) => <li key={stage.id} className="grid gap-2 py-3 sm:grid-cols-[220px_minmax(0,1fr)]">
      <span className="flex items-center gap-3 text-sm"><span className="w-4 shrink-0 text-xs tabular-nums text-[var(--color-muted-foreground)]">{String(index + 1).padStart(2, '0')}</span><span className="min-w-0">{stageDescriptions[stage.id]?.label ?? stage.title}<span className="mt-1 block text-xs text-[var(--color-muted-foreground)]">{stage.title}</span></span>
        {stage.state === 'RUNNING' && <Loader2 aria-label="处理中" className="size-3 animate-spin" />}{stage.state === 'COMPLETED' && <Check aria-label="已完成" className="size-3" />}</span>
      <span className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">{explainProfileMessage(stage.message || '等待执行')}</span>
    </li>)}</ol>
    {run.message && <p role={run.state === 'FAILED' ? 'alert' : 'status'} className="break-words text-sm">{run.message}</p>}
  </section>
}

export function ProfileOverview({ profile }: { profile: SystemProfile }) {
  return <section className="space-y-6"><div><h2 className="text-base font-semibold">系统画像（System Profile） <span className="ml-2 font-normal text-[var(--color-muted-foreground)]">v{profile.version}</span></h2>
    <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">生成于 {new Date(profile.generatedAt).toLocaleString()} · 五类权威资产入口</p></div>
    <div className="divide-y divide-[var(--color-border)]">{profile.assets.map(asset => <div key={asset.kind} className="flex flex-wrap justify-between gap-3 py-4"><span className="text-sm font-medium">{assetTitle(asset)}</span><span className="text-xs text-[var(--color-muted-foreground)]">{asset.status === 'READY' ? '已发现证据' : asset.status === 'PARTIAL' ? '部分证据' : '待补齐'} · {asset.sources.length} 个来源</span></div>)}</div>
    {profile.gaps.length > 0 && <div className="border-l-2 border-[var(--color-border)] pl-4"><h3 className="text-sm font-medium">下一步需要补齐</h3><ul className="mt-3 space-y-2 text-sm text-[var(--color-muted-foreground)]">{profile.gaps.map(gap => <li key={gap}>{explainProfileMessage(gap)}</li>)}</ul><p className="mt-4 text-xs text-[var(--color-muted-foreground)]">“同步画像”只重新检查现有证据，不更新图谱。已有图谱仍需确认与当前源码一致；“重新完整初始化”会在必要时尝试图谱提取，不等同于增量更新。</p></div>}
  </section>
}

export function AssetPanel({ asset }: { asset?: ProfileAsset }) {
  if (!asset) return <p className="py-6 text-sm text-[var(--color-muted-foreground)]">该资产尚未生成，请先执行 Full Init。</p>
  return <section className="space-y-6"><h2 className="text-base font-semibold">{assetTitle(asset)}</h2>
    <dl className="space-y-4">{Object.entries(asset.facts).map(([key, value]) => <div key={key} className="grid gap-2 sm:grid-cols-[180px_minmax(0,1fr)]"><dt className="text-xs text-[var(--color-muted-foreground)]">{factLabels[key] ?? key}</dt><dd className="break-words text-sm">{explainProfileMessage(value)}</dd></div>)}</dl>
    <div className="border-t border-[var(--color-border)] pt-6"><h3 className="text-sm font-medium">证据来源</h3><p className="mt-2 text-xs text-[var(--color-muted-foreground)]">以下路径相对于项目根目录。内容由对应工程或知识工具维护。</p>
      {asset.sources.length ? <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto text-xs">{asset.sources.map(source => <li key={source} className="break-all font-mono">{source}</li>)}</ul>
        : <p className="mt-4 text-sm text-[var(--color-muted-foreground)]">尚无来源。补齐工程规则或知识产物后同步画像。</p>}</div>
  </section>
}

const factLabels: Record<string, string> = { sourceFiles: '工程文件', scanComplete: '扫描覆盖完整', scanGaps: '扫描缺口', gitHead: 'Git 提交', gitBranch: 'Git 分支', hostRuntime: 'Forge 宿主环境', stack: '技术栈', environment: '环境检查范围', nodes: 'Graph Nodes', evidence: '证据说明', strategy: '执行策略', backend: '后端验证命令' }
