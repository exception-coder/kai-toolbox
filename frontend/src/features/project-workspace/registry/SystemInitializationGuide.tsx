import { stageDescriptions } from './profileLabels'

export function SystemInitializationGuide() {
  return <section className="space-y-6 border-t border-[var(--color-border)] pt-8" aria-label="检查与初始化说明">
    <div><h2 className="text-base font-semibold">检查与初始化：做什么，为什么做</h2>
      <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]">目的是建立 AI 能持续使用的系统上下文。初始化状态表示上下文证据的准备情况，不代表应用已经构建成功、测试通过或数据库已核验。</p></div>
    <div className="grid gap-6 md:grid-cols-2">
      <div><h3 className="text-sm font-medium">完整初始化（Full Init）</h3><p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]">首次接入，或图谱缺失、过期及需要重建时使用。执行下面七个阶段，必要时尝试构建 Graphify 图谱，最终生成新版本系统画像。</p></div>
      <div><h3 className="text-sm font-medium">同步画像（Sync）</h3><p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]">修改代码、项目设置或补齐规则后使用。重新检查现有证据并生成新版本画像；当前不会执行增量图谱重建，也不会替你运行构建、测试或数据库变更。</p></div>
    </div>
    <dl className="divide-y divide-[var(--color-border)]">{Object.entries(stageDescriptions).map(([id, item], index) => <div key={id} className="grid gap-3 py-5 lg:grid-cols-[220px_minmax(0,1fr)]">
      <dt className="text-sm font-medium"><span className="mr-3 text-xs tabular-nums text-[var(--color-muted-foreground)]">{String(index + 1).padStart(2, '0')}</span>{item.label}</dt>
      <dd className="space-y-2 text-sm leading-relaxed text-[var(--color-muted-foreground)]"><p><span className="font-medium text-[var(--color-foreground)]">检查内容：</span>{item.check}</p><p><span className="font-medium text-[var(--color-foreground)]">初始化产出：</span>{item.output}</p><p><span className="font-medium text-[var(--color-foreground)]">目的：</span>{item.purpose}</p></dd>
    </div>)}</dl>
  </section>
}
