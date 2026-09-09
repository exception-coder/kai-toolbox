import { formatMs, statusLabels, type MeasurementReport, type StartupSnapshot } from '../model'

const stages = [
  ['mainEntered', '进入应用入口'],
  ['springInvoked', '开始初始化 Spring'],
  ['contextRefreshed', '容器刷新完成'],
  ['applicationReady', '应用就绪'],
  ['firstApiSuccess', '首个成功 API'],
] as const

export function StartupStages({ snapshot, report }: {
  snapshot: StartupSnapshot | null; report: MeasurementReport | null
}) {
  const maximum = Math.max(1, ...Object.values(snapshot?.milestones ?? {}).map(value => value.elapsedMs ?? 0))
  const build = report?.build ?? snapshot?.build
  const preparation = build?.scope === 'maven-before-jvm'
  return <section aria-labelledby="startup-stages-title">
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-3">
      <h2 id="startup-stages-title" className="font-medium">启动阶段</h2>
      <span className="text-xs text-muted-foreground">运行里程碑相对 JVM 启动；时间不累加</span>
    </div>
    <div className="flex flex-wrap justify-between gap-3 border-b border-border py-4 text-sm">
      <div><span>{preparation ? 'Maven 启动准备' : 'Maven 构建'}</span><span className="ml-3 text-xs text-muted-foreground">{preparation ? '至应用 JVM 启动' : 'package · 独立计时'}</span></div>
      <div className="flex gap-4"><span className="text-muted-foreground">{statusLabels[build?.status ?? 'NOT_MEASURED']}</span>
        <span className="font-mono tabular-nums">{formatMs(build?.durationMs)}</span></div>
    </div>
    <ol className="divide-y divide-border">
      {stages.map(([key, label]) => {
        const observation = snapshot?.milestones[key]
        return <li key={key} className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 py-4 text-sm sm:grid-cols-[180px_1fr_100px]">
          <div><p>{label}</p><p className="mt-1 text-xs text-muted-foreground">{statusLabels[observation?.status ?? 'NOT_OBSERVED']}</p></div>
          <div className="order-3 col-span-2 h-1 bg-muted sm:order-none sm:col-span-1" aria-hidden="true">
            <div className="h-full bg-foreground/60" style={{ width: `${(observation?.elapsedMs ?? 0) / maximum * 100}%` }} />
          </div>
          <span className="text-right font-mono tabular-nums">{formatMs(observation?.elapsedMs)}</span>
        </li>
      })}
    </ol>
    {!report && <p className="mt-3 text-xs leading-6 text-muted-foreground">
      {build?.status === 'COMPLETED'
        ? preparation
          ? '由监督启动流程自动记录，包含 Maven 准备、编译和 JVM 创建。此值属于本次 JVM 初始启动，不代表热编译耗时。'
          : '由监督启动流程自动记录 Maven package 耗时，未包含后续应用运行。'
        : '本次启动未携带构建计时。使用更新后的 run-supervised.cmd 正常启动，即可自动记录，无需额外测量脚本。'}
    </p>}
    {snapshot?.milestones.firstApiSuccess.source && <p className="mt-3 break-all font-mono text-xs text-muted-foreground">{snapshot.milestones.firstApiSuccess.source}</p>}
  </section>
}
