import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { getForgeEnvironment } from '../api'
import type { EnvironmentEngine, ForgeEnvironmentSnapshot } from '../types'

type Comparison = { engine: EnvironmentEngine; snapshot?: ForgeEnvironmentSnapshot; error?: string }

function elapsed(milliseconds?: number) {
  return milliseconds === undefined ? '—' : `${(milliseconds / 1000).toFixed(2)} s`
}

function stateDifferences(results: Comparison[]) {
  const snapshots = results.map((result) => result.snapshot)
  if (!snapshots[0] || !snapshots[1]) return null
  const first = new Map(snapshots[0].groups.flatMap((group) => group.items).map((item) => [item.id, item]))
  const changed = snapshots[1].groups.flatMap((group) => group.items).filter((item) => {
    const other = first.get(item.id)
    return !other || other.state !== item.state || other.version !== item.version || other.blocking !== item.blocking
  })
  return changed.length ? `结果差异：${changed.map((item) => item.name).join('、')}` : '两次检测的依赖状态与版本一致'
}

/** 引擎切换与顺序测量，成功结果不会被另一引擎的错误覆盖。 */
export function ProbeEngineControls({ engine, onChange, snapshot, busy, detecting = false, comparing, onComparing }: {
  engine: EnvironmentEngine
  onChange: (engine: EnvironmentEngine) => void
  snapshot?: ForgeEnvironmentSnapshot
  busy: boolean
  detecting?: boolean
  comparing: boolean
  onComparing: (value: boolean) => void
}) {
  const [results, setResults] = useState<Comparison[]>([])
  const [checking, setChecking] = useState<EnvironmentEngine | null>(null)

  async function compare() {
    if (busy || detecting || comparing) return
    onComparing(true)
    setResults([])
    try {
      for (const candidate of ['java', 'go'] as const) {
        setChecking(candidate)
        try {
          const measured = await getForgeEnvironment(false, candidate, true)
          setResults((current) => [...current, { engine: candidate, snapshot: measured }])
        } catch (cause) {
          setResults((current) => [...current, { engine: candidate, error: cause instanceof Error ? cause.message : '检测失败，请重试' }])
        }
      }
    } finally {
      setChecking(null)
      onComparing(false)
    }
  }

  const measurement = snapshot?.measurement
  const commands = results.find((result) => result.snapshot)?.snapshot?.measurement?.commands ?? []
  return (
    <section aria-label="环境检测引擎" className="mb-6 border-b border-[var(--color-border)] pb-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">检测引擎</span>
        <div role="group" aria-label="选择检测引擎" className="flex gap-1">
          {(['java', 'go'] as const).map((candidate) => (
            <Button key={candidate} size="sm" variant={engine === candidate ? 'default' : 'ghost'}
              aria-pressed={engine === candidate} disabled={busy || comparing} onClick={() => onChange(candidate)}>
              {candidate === 'java' ? 'Java' : 'Go'}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" disabled={busy || detecting || comparing} onClick={() => void compare()}>
          {comparing ? `正在检测 ${checking === 'go' ? 'Go' : 'Java'}…` : '对比两种实现'}
        </Button>
        {measurement && <span className="text-xs tabular-nums text-[var(--color-muted-foreground)]">
          {measurement.engine === 'go' ? 'Go' : 'Java'} · 探测 {elapsed(measurement.probesMs)} · 整体 {elapsed(measurement.totalMs)}
        </span>}
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--color-muted-foreground)]">
        切换本机命令探测实现；版本判定、公司套件和仓库检查共用 Java。对比顺序执行，不使用检测结果缓存、不拉取远端；系统缓存仍会影响耗时。
      </p>
      {results.length > 0 && <div className="mt-4 space-y-3" aria-live="polite">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <caption className="sr-only">Java 和 Go 本次顺序检测耗时</caption>
            <thead className="text-xs text-[var(--color-muted-foreground)]"><tr>
              <th className="py-2 font-medium">实现</th><th className="font-medium">命令探测</th>
              <th className="font-medium">整体检测</th><th className="font-medium">检测时间</th>
            </tr></thead>
            <tbody>{results.map((result) => <tr key={result.engine} className="border-t border-[var(--color-border)]">
              <th className="py-3 font-medium">{result.engine === 'go' ? 'Go' : 'Java'}</th>
              {result.error ? <td colSpan={3} className="py-3 text-[var(--color-destructive)]">{result.error}</td> : <>
                <td>{elapsed(result.snapshot?.measurement?.probesMs)}</td>
                <td>{elapsed(result.snapshot?.measurement?.totalMs)}</td>
                <td className="text-xs">{result.snapshot && new Date(result.snapshot.checkedAt).toLocaleTimeString()}</td>
              </>}
            </tr>)}</tbody>
          </table>
        </div>
        {stateDifferences(results) && <p className="text-xs">{stateDifferences(results)}</p>}
        {commands.length > 0 && <details className="text-xs">
          <summary className="cursor-pointer py-2">逐命令耗时与退出码</summary>
          <table className="mt-2 w-full text-left tabular-nums">
            <thead><tr><th className="py-2 font-medium">命令</th><th>Java</th><th>Go</th></tr></thead>
            <tbody>{commands.map((command) => <tr key={command.id} className="border-t border-[var(--color-border)]">
              <th className="py-2 font-normal">{command.id}</th>
              {(['java', 'go'] as const).map((candidate) => {
                const item = results.find((result) => result.engine === candidate)?.snapshot?.measurement?.commands.find((item) => item.id === command.id)
                return <td key={candidate}>{elapsed(item?.durationMs)}{item && ` · exit ${item.exitCode}${item.completed ? '' : ' · 未完成'}`}</td>
              })}
            </tr>)}</tbody>
          </table>
        </details>}
      </div>}
    </section>
  )
}
