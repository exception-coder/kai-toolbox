import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle, CheckCircle2, Download, GitCompare, Loader2, Play, RefreshCw, XCircle,
} from 'lucide-react'
import {
  deleteRun, getDiff, getExtractionSummary, harvest, listAdapters, listDatasets, listResults,
  listRuns, listSources, startRun,
} from '../api'
import type { AssertionOutcome, EvalResult, EvalRun } from '../types'
import { Button } from '@/components/ui/button'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { useConfirm } from '@/components/ui/confirm-dialog'

const RUN_STATUS_TONE: Record<string, StatusTone> = {
  RUNNING: 'info',
  SUCCESS: 'success',
  FAILED: 'danger',
}

const VERDICT_TONE: Record<string, StatusTone> = {
  PASS: 'success',
  FAIL: 'danger',
  ERROR: 'warning',
}

const fmtTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleString('zh-CN', { hour12: false }) : '—'

const pct = (n: number) => `${(n * 100).toFixed(1)}%`

function parseAssertions(raw?: string | null): AssertionOutcome[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function EvalPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()

  const [dataset, setDataset] = useState<string>('')
  const [adapter, setAdapter] = useState<string>('')
  const [selectedRun, setSelectedRun] = useState<string>('')
  const [baseRun, setBaseRun] = useState<string>('')

  const datasetsQ = useQuery({ queryKey: ['eval', 'datasets'], queryFn: listDatasets })
  const sourcesQ = useQuery({ queryKey: ['eval', 'sources'], queryFn: listSources })
  const harvestM = useMutation({
    mutationFn: (source: string) => harvest(source),
    onSuccess: (r) => {
      // 纳入后数据集下拉与待纳入计数都会变，一并刷新；顺手选中刚纳入的数据集，省一次手动选择
      qc.invalidateQueries({ queryKey: ['eval', 'datasets'] })
      qc.invalidateQueries({ queryKey: ['eval', 'sources'] })
      if (r.created > 0) setDataset(r.dataset)
    },
  })
  const adaptersQ = useQuery({ queryKey: ['eval', 'adapters'], queryFn: listAdapters })

  const runsQ = useQuery({
    queryKey: ['eval', 'runs', dataset],
    queryFn: () => listRuns(dataset || undefined),
    // 有 RUNNING 的 run 时轮询进度；全部结束就停，避免空转。
    refetchInterval: (q) =>
      (q.state.data as EvalRun[] | undefined)?.some((r) => r.status === 'RUNNING') ? 2000 : false,
  })

  const resultsQ = useQuery({
    queryKey: ['eval', 'results', selectedRun],
    queryFn: () => listResults(selectedRun),
    enabled: !!selectedRun,
  })

  const currentRun = useMemo(
    () => runsQ.data?.find((r) => r.id === selectedRun),
    [runsQ.data, selectedRun],
  )

  const summaryQ = useQuery({
    queryKey: ['eval', 'summary', selectedRun],
    queryFn: () => getExtractionSummary(selectedRun),
    enabled: !!selectedRun && currentRun?.scenario === 'EXTRACTION' && currentRun?.status !== 'RUNNING',
  })

  const diffQ = useQuery({
    queryKey: ['eval', 'diff', baseRun, selectedRun],
    queryFn: () => getDiff(baseRun, selectedRun),
    enabled: !!baseRun && !!selectedRun && baseRun !== selectedRun,
  })

  const startM = useMutation({
    mutationFn: () => startRun({ adapter, dataset }),
    onSuccess: (run) => {
      setSelectedRun(run.id)
      qc.invalidateQueries({ queryKey: ['eval', 'runs'] })
    },
  })

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteRun(id),
    onSuccess: (_d, id) => {
      if (selectedRun === id) setSelectedRun('')
      if (baseRun === id) setBaseRun('')
      qc.invalidateQueries({ queryKey: ['eval', 'runs'] })
    },
  })

  const canStart = !!dataset && !!adapter && !startM.isPending

  const handleDelete = async (run: EvalRun) => {
    const ok = await confirm({
      title: '删除这次运行？',
      description: `${run.dataset} · ${fmtTime(run.startedAt)}，其逐用例结果将一并删除，不可恢复。`,
      confirmText: '删除',
      variant: 'destructive',
    })
    if (ok) deleteM.mutate(run.id)
  }

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">回归评测</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            黄金集跑批 → 确定性断言 → 与历史运行对比，只看 pass→fail 的退化清单。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => runsQ.refetch()}>
          <RefreshCw className={runsQ.isFetching ? 'animate-spin' : ''} />
          刷新
        </Button>
      </header>

      {/* ───── 样本来源：把已人工裁决的历史记录纳入黄金集 ───── */}
      <section className="rounded-lg border p-4">
        <div className="mb-2 flex items-baseline gap-2">
          <h2 className="text-sm font-medium">样本来源</h2>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            把各模块中已被人工裁决过的历史记录纳入黄金集。纳入即冻结快照，之后再改原记录不影响已有用例，跑批才可比。
          </span>
        </div>
        {sourcesQ.data?.length ? (
          <ul className="flex flex-col gap-2">
            {sourcesQ.data.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
                <span className="text-sm">{s.displayName}</span>
                <span className="text-xs text-[var(--color-muted-foreground)]">
                  共 {s.total} 条{s.pending > 0 ? ` · 待纳入 ${s.pending} 条` : ' · 已全部纳入'}
                </span>
                <Button
                  className="ml-auto"
                  size="sm"
                  variant={s.pending > 0 ? 'default' : 'outline'}
                  disabled={s.pending === 0 || harvestM.isPending}
                  onClick={() => harvestM.mutate(s.id)}
                >
                  {harvestM.isPending && harvestM.variables === s.id ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Download />
                  )}
                  纳入黄金集
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            暂无样本来源。业务系统咨询里把 AI 登记的缺陷「确认」或「驳回」后，这里就会出现可纳入的样本。
          </p>
        )}
        {harvestM.isError && (
          <p className="mt-2 text-xs text-[var(--color-danger)]">
            {(harvestM.error as Error).message}
          </p>
        )}
        {harvestM.isSuccess && (
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            已纳入 {harvestM.data.created} 条到数据集「{harvestM.data.dataset}」
            {harvestM.data.skipped > 0 ? `，跳过 ${harvestM.data.skipped} 条（此前已纳入）` : ''}。
          </p>
        )}
      </section>

      {/* ───── 发起评测 ───── */}
      <section className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <label className="flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">
          数据集
          <select
            className="h-9 min-w-56 rounded-md border bg-[var(--color-background)] px-2 text-sm"
            value={dataset}
            onChange={(e) => setDataset(e.target.value)}
          >
            <option value="">选择数据集…</option>
            {datasetsQ.data?.map((d) => (
              <option key={`${d.scenario}/${d.dataset}`} value={d.dataset}>
                {d.dataset}（{d.scenario} · 启用 {d.enabledCount}/{d.total}）
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">
          被测适配器
          <select
            className="h-9 min-w-56 rounded-md border bg-[var(--color-background)] px-2 text-sm"
            value={adapter}
            onChange={(e) => setAdapter(e.target.value)}
          >
            <option value="">选择适配器…</option>
            {adaptersQ.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id}（{a.scenario}）
              </option>
            ))}
          </select>
        </label>

        <Button disabled={!canStart} onClick={() => startM.mutate()}>
          {startM.isPending ? <Loader2 className="animate-spin" /> : <Play />}
          开始评测
        </Button>

        {startM.isError && (
          <span className="text-xs text-[var(--color-danger)]">
            {(startM.error as Error).message}
          </span>
        )}
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        {/* ───── 运行历史 ───── */}
        <aside className="flex min-h-0 flex-col rounded-lg border">
          <div className="border-b px-3 py-2 text-sm font-medium">运行历史</div>
          <div className="min-h-0 flex-1 overflow-auto">
            {runsQ.data?.length === 0 && (
              <p className="p-4 text-xs text-[var(--color-muted-foreground)]">还没有运行记录。</p>
            )}
            {runsQ.data?.map((run) => (
              <div
                key={run.id}
                onClick={() => setSelectedRun(run.id)}
                className={`cursor-pointer border-b px-3 py-2 text-xs transition-colors hover:bg-[var(--color-accent)] ${
                  selectedRun === run.id ? 'bg-[var(--color-accent)]' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{run.dataset}</span>
                  <StatusBadge tone={RUN_STATUS_TONE[run.status] ?? 'neutral'} pulse={run.status === 'RUNNING'}>
                    {run.status}
                  </StatusBadge>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[var(--color-muted-foreground)]">
                  <span className="text-[var(--color-success)]">{run.passed} 过</span>
                  <span className="text-[var(--color-danger)]">{run.failed} 挂</span>
                  {run.errored > 0 && <span className="text-[var(--color-warning)]">{run.errored} 错</span>}
                  <span>/ {run.total}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--color-muted-foreground)]">
                  <span>
                    {run.adapter}
                    {run.promptVersion != null && ` · prompt v${run.promptVersion}`}
                  </span>
                  <span>{fmtTime(run.startedAt)}</span>
                </div>
                <div className="mt-1 flex gap-2">
                  <button
                    className="text-[10px] underline-offset-2 hover:underline"
                    onClick={(e) => { e.stopPropagation(); setBaseRun(run.id) }}
                  >
                    设为基线
                  </button>
                  <button
                    className="text-[10px] text-[var(--color-danger)] underline-offset-2 hover:underline"
                    onClick={(e) => { e.stopPropagation(); void handleDelete(run) }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ───── 详情 ───── */}
        <main className="flex min-h-0 flex-col gap-4 overflow-auto">
          {!selectedRun && (
            <div className="rounded-lg border p-8 text-center text-sm text-[var(--color-muted-foreground)]">
              选择左侧一次运行查看结果，或再选一次「设为基线」做退化对比。
            </div>
          )}

          {/* 混淆矩阵：通过率会被大量非 BUG 用例稀释，误报率才是这条链路的风险面 */}
          {summaryQ.data && (
            <section className="rounded-lg border p-4">
              <h2 className="mb-3 text-sm font-medium">抽取判定质量（isBug）</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="精确率 Precision" value={pct(summaryQ.data.precision)} hint="判为 BUG 的里有多少真是" />
                <Metric label="召回率 Recall" value={pct(summaryQ.data.recall)} hint="真 BUG 里抓到了多少" />
                <Metric label="F1" value={pct(summaryQ.data.f1)} />
                <Metric
                  label="误报 / 漏报"
                  value={`${summaryQ.data.falsePositive} / ${summaryQ.data.falseNegative}`}
                  hint="误报直接消耗人工核实成本"
                />
              </div>
            </section>
          )}

          {/* 退化对比 */}
          {diffQ.data && (
            <section className="rounded-lg border p-4">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
                <GitCompare className="size-4" />
                与基线对比
                <span className="font-normal text-[var(--color-muted-foreground)]">
                  {fmtTime(diffQ.data.base.startedAt)} → {fmtTime(diffQ.data.target.startedAt)}
                </span>
              </h2>
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                <StatusBadge tone="danger">退化 {diffQ.data.regressed.length}</StatusBadge>
                <StatusBadge tone="success">修复 {diffQ.data.fixed.length}</StatusBadge>
                <StatusBadge tone="warning">仍失败 {diffQ.data.stillFailing.length}</StatusBadge>
                <StatusBadge tone="neutral">稳定通过 {diffQ.data.unchangedPass}</StatusBadge>
              </div>
              {diffQ.data.regressed.length > 0 ? (
                <ul className="space-y-1">
                  {diffQ.data.regressed.map((d) => (
                    <li
                      key={d.caseId}
                      className="rounded border border-[var(--color-danger)]/30 bg-[var(--color-danger-soft)] px-3 py-2 text-xs"
                    >
                      <div className="flex items-center gap-2 font-medium">
                        <AlertTriangle className="size-3.5" />
                        {d.caseTitle ?? d.caseId}
                      </div>
                      {parseAssertions(d.targetAssertions)
                        .filter((a) => !a.passed)
                        .map((a, i) => (
                          <div key={i} className="mt-1 pl-5 text-[var(--color-muted-foreground)]">
                            <code>{a.path}</code>：{a.message ?? '未通过'}
                          </div>
                        ))}
                      {d.targetError && <div className="mt-1 pl-5">{d.targetError}</div>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--color-muted-foreground)]">无退化项。</p>
              )}
            </section>
          )}

          {/* 逐用例结果 */}
          {selectedRun && (
            <section className="rounded-lg border">
              <div className="flex items-center justify-between border-b px-4 py-2 text-sm font-medium">
                <span>逐用例结果</span>
                {baseRun && baseRun !== selectedRun && (
                  <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
                    基线已选，对比见上方
                  </span>
                )}
              </div>
              <div className="divide-y">
                {resultsQ.data?.map((r) => <ResultRow key={r.id} result={r} />)}
                {resultsQ.data?.length === 0 && (
                  <p className="p-4 text-xs text-[var(--color-muted-foreground)]">暂无结果，运行可能仍在进行。</p>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted-foreground)]">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">{hint}</div>}
    </div>
  )
}

function ResultRow({ result }: { result: EvalResult }) {
  const [open, setOpen] = useState(false)
  const assertions = parseAssertions(result.assertionsJson)
  const failed = assertions.filter((a) => !a.passed)

  return (
    <div className="px-4 py-2 text-xs">
      <div className="flex cursor-pointer items-center gap-2" onClick={() => setOpen((v) => !v)}>
        {result.verdict === 'PASS'
          ? <CheckCircle2 className="size-3.5 text-[var(--color-success)]" />
          : <XCircle className="size-3.5 text-[var(--color-danger)]" />}
        <span className="flex-1 truncate">{result.caseTitle ?? result.caseId}</span>
        <StatusBadge tone={VERDICT_TONE[result.verdict] ?? 'neutral'} dot={false}>
          {result.verdict}
        </StatusBadge>
        <span className="tabular-nums text-[var(--color-muted-foreground)]">{pct(result.score)}</span>
        <span className="tabular-nums text-[var(--color-muted-foreground)]">{result.latencyMs}ms</span>
      </div>

      {!open && failed.length > 0 && (
        <div className="mt-1 pl-5 text-[var(--color-muted-foreground)]">
          {failed.length} 条断言未通过：{failed.map((a) => a.path).join('、')}
        </div>
      )}

      {open && (
        <div className="mt-2 space-y-2 pl-5">
          {result.error && <div className="text-[var(--color-warning)]">{result.error}</div>}
          {assertions.length > 0 && (
            <table className="w-full text-[11px]">
              <thead className="text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="text-left font-normal">字段</th>
                  <th className="text-left font-normal">断言</th>
                  <th className="text-left font-normal">期望</th>
                  <th className="text-left font-normal">实际</th>
                </tr>
              </thead>
              <tbody>
                {assertions.map((a, i) => (
                  <tr key={i} className={a.passed ? '' : 'text-[var(--color-danger)]'}>
                    <td className="pr-2"><code>{a.path}</code></td>
                    <td className="pr-2">{a.type}</td>
                    <td className="pr-2">{a.expected ?? '—'}</td>
                    <td>{a.actual ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {result.rawOutput && (
            <details>
              <summary className="cursor-pointer text-[var(--color-muted-foreground)]">原始输出</summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-[var(--color-muted)] p-2">
                {result.rawOutput}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
