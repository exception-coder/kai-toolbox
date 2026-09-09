import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  GitCompare,
  Loader2,
  Play,
  RefreshCw,
  XCircle,
} from "lucide-react";
import {
  deleteRun,
  getDiff,
  getExtractionSummary,
  harvest,
  listAdapters,
  listDatasets,
  listResults,
  listRuns,
  listSources,
  retryScoreExports,
  startRun,
} from "../api";
import type {
  AssertionOutcome,
  EvalResult,
  EvalRun,
  SampleSource,
} from "../types";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { useConfirm } from "@/components/ui/confirm-dialog";

const RUN_STATUS_TONE: Record<string, StatusTone> = {
  RUNNING: "info",
  SUCCESS: "success",
  FAILED: "danger",
};

const VERDICT_TONE: Record<string, StatusTone> = {
  PASS: "success",
  FAIL: "danger",
  ERROR: "warning",
};

const fmtTime = (ms?: number | null) =>
  ms ? new Date(ms).toLocaleString("zh-CN", { hour12: false }) : "—";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

const labelStrengthName = (value: string) =>
  ({
    HUMAN_STRONG: "人工强标注",
    WEAK: "弱标注",
    BASELINE_PENDING: "待人工基线",
    UNSPECIFIED: "未标注",
  })[value] ?? value;

const adapterDisplayName = (id: string) =>
  ({
    "business-consult": "业务咨询 Agent",
    "bug-extraction": "缺陷抽取能力",
  })[id] ?? id;

const datasetDisplayName = (dataset: string) =>
  ({
    "business-consult-answer-quality-v1": "业务咨询回答质量",
    "bug-extraction-v1": "缺陷识别与漏报检测",
  })[dataset] ?? dataset;

interface SampleSourceGroup {
  dataset: string;
  sources: SampleSource[];
  total: number;
  pending: number;
  misassigned: number;
}

function groupSampleSources(sources: SampleSource[]): SampleSourceGroup[] {
  const groups = new Map<string, SampleSourceGroup>();
  for (const source of sources) {
    const group = groups.get(source.targetDataset) ?? {
      dataset: source.targetDataset,
      sources: [],
      total: 0,
      pending: 0,
      misassigned: 0,
    };
    group.sources.push(source);
    group.total += source.total;
    group.pending += source.pending;
    group.misassigned += source.misassigned;
    groups.set(source.targetDataset, group);
  }
  return [...groups.values()];
}

function parseAssertions(raw?: string | null): AssertionOutcome[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function EvalPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();

  const [dataset, setDataset] = useState<string>("");
  const [adapter, setAdapter] = useState<string>("");
  const [selectedRun, setSelectedRun] = useState<string>("");
  const [baseRun, setBaseRun] = useState<string>("");

  const datasetsQ = useQuery({
    queryKey: ["eval", "datasets"],
    queryFn: listDatasets,
  });
  const sourcesQ = useQuery({
    queryKey: ["eval", "sources"],
    queryFn: listSources,
  });
  const sourceGroups = useMemo(
    () => groupSampleSources(sourcesQ.data ?? []),
    [sourcesQ.data],
  );
  const harvestM = useMutation({
    mutationFn: (v: { source: string; refresh?: boolean }) =>
      harvest(v.source, { refresh: v.refresh }),
    onSuccess: (r) => {
      // 纳入后数据集下拉与待纳入计数都会变，一并刷新；顺手选中刚纳入的数据集，省一次手动选择
      qc.invalidateQueries({ queryKey: ["eval", "datasets"] });
      qc.invalidateQueries({ queryKey: ["eval", "sources"] });
      if (r.created > 0 || r.moved > 0) setDataset(r.dataset);
    },
  });
  const adaptersQ = useQuery({
    queryKey: ["eval", "adapters"],
    queryFn: listAdapters,
  });

  const selectedDataset = datasetsQ.data?.find(
    (item) => item.dataset === dataset,
  );
  useEffect(() => {
    if (!selectedDataset || !adaptersQ.data) return;
    const matching = adaptersQ.data.find(
      (item) => item.scenario === selectedDataset.scenario,
    );
    if (matching && adapter !== matching.id) setAdapter(matching.id);
  }, [adapter, adaptersQ.data, selectedDataset]);

  const runsQ = useQuery({
    queryKey: ["eval", "runs", dataset],
    queryFn: () => listRuns(dataset || undefined),
    // 有 RUNNING 的 run 时轮询进度；全部结束就停，避免空转。
    refetchInterval: (q) =>
      (q.state.data as EvalRun[] | undefined)?.some(
        (r) => r.status === "RUNNING",
      )
        ? 2000
        : false,
  });

  const currentRun = useMemo(
    () => runsQ.data?.find((r) => r.id === selectedRun),
    [runsQ.data, selectedRun],
  );

  // 运行状态进 queryKey：跑批刚发起时结果集必然是空的，若不随状态变化重取，
  // 跑完后明细会永远停在最初那次空响应上（指标有数、明细空白）。
  // RUNNING 期间顺带轮询，串行跑批能看到结果一条条出来。
  const resultsQ = useQuery({
    queryKey: ["eval", "results", selectedRun, currentRun?.status ?? ""],
    queryFn: () => listResults(selectedRun),
    enabled: !!selectedRun,
    refetchInterval: currentRun?.status === "RUNNING" ? 2000 : false,
  });

  const summaryQ = useQuery({
    queryKey: ["eval", "summary", selectedRun],
    queryFn: () => getExtractionSummary(selectedRun),
    enabled:
      !!selectedRun &&
      currentRun?.scenario === "EXTRACTION" &&
      currentRun?.status !== "RUNNING",
  });

  const retryScoreM = useMutation({
    mutationFn: retryScoreExports,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["eval", "results", selectedRun] }),
  });

  const diffQ = useQuery({
    queryKey: ["eval", "diff", baseRun, selectedRun],
    queryFn: () => getDiff(baseRun, selectedRun),
    enabled: !!baseRun && !!selectedRun && baseRun !== selectedRun,
  });

  const startM = useMutation({
    mutationFn: () => startRun({ adapter, dataset }),
    onSuccess: (run) => {
      setSelectedRun(run.id);
      qc.invalidateQueries({ queryKey: ["eval", "runs"] });
    },
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteRun(id),
    onSuccess: (_d, id) => {
      if (selectedRun === id) setSelectedRun("");
      if (baseRun === id) setBaseRun("");
      qc.invalidateQueries({ queryKey: ["eval", "runs"] });
    },
  });

  const canStart = !!dataset && !!adapter && !startM.isPending;

  const handleDelete = async (run: EvalRun) => {
    const ok = await confirm({
      title: "删除这次运行？",
      description: `${run.dataset} · ${fmtTime(run.startedAt)}，其逐用例结果将一并删除，不可恢复。`,
      confirmText: "删除",
      variant: "destructive",
    });
    if (ok) deleteM.mutate(run.id);
  };

  return (
    <div className="flex min-h-full min-w-0 flex-col gap-4 overflow-x-hidden p-4 sm:p-6 lg:h-full">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">回归评测</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            黄金集跑批 → 确定性断言 → 与历史运行对比，只看 pass→fail
            的退化清单。
          </p>
        </div>
        <Button
          className="h-11 shrink-0 px-3 sm:h-8"
          variant="outline"
          size="sm"
          onClick={() => runsQ.refetch()}
        >
          <RefreshCw className={runsQ.isFetching ? "animate-spin" : ""} />
          刷新
        </Button>
      </header>

      <section className="border-y py-3 text-xs leading-5 text-[var(--color-muted-foreground)]">
        <span className="font-medium text-[var(--color-foreground)]">
          评测边界：
        </span>
        一次触发按 Turn 计算（用户本轮问题 → Agent 最终回答）；Session
        只关联上下文，重试记为新的 Agent Run。
      </section>

      {/* ───── 样本来源：来源负责采集，稳定数据集负责可比评测 ───── */}
      <section className="rounded-lg border px-4 py-3 sm:p-4">
        <div className="mb-2 sm:flex sm:items-baseline sm:gap-2">
          <h2 className="shrink-0 text-sm font-medium">样本来源</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--color-muted-foreground)] sm:mt-0">
            来源是采集通道，不是数据集。相同任务的强标注与弱标注进入同一个稳定数据集，纳入后冻结快照。
          </p>
        </div>
        {sourceGroups.length ? (
          <div className="divide-y border-t">
            {sourceGroups.map((group) => (
              <details key={group.dataset} className="group/source py-1">
                <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">
                      {datasetDisplayName(group.dataset)}
                    </div>
                    <div className="mt-1 break-all font-mono text-[11px] text-[var(--color-muted-foreground)]">
                      {group.dataset}
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-xs text-[var(--color-muted-foreground)]">
                    <div>
                      {group.total} 条 · {group.sources.length} 个来源
                    </div>
                    <div className="mt-1">
                      待纳入 {group.pending} 条
                      {group.misassigned > 0
                        ? ` · 待归并 ${group.misassigned} 条`
                        : ""}
                    </div>
                  </div>
                  <ChevronDown className="size-4 shrink-0 text-[var(--color-muted-foreground)] transition-transform group-open/source:rotate-180" />
                </summary>
                <ul className="divide-y border-t pl-3 sm:pl-6">
                  {group.sources.map((s) => (
                    <li
                      key={s.id}
                      className="grid min-w-0 gap-3 py-4 lg:grid-cols-[minmax(16rem,1fr)_auto_auto] lg:items-center"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm">{s.displayName}</span>
                          <span className="rounded border px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                            {s.sampleUnit === "TURN"
                              ? "轮次 · Turn"
                              : s.sampleUnit}
                          </span>
                          <span className="rounded border px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">
                            {labelStrengthName(s.labelStrength)}
                          </span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-[var(--color-muted-foreground)]">
                          <span className="block sm:inline">来源 {s.id}</span>
                          <span className="mx-1 hidden sm:inline">→</span>
                        </p>
                      </div>
                      <span className="text-xs text-[var(--color-muted-foreground)]">
                        共 {s.total} 条 · 待纳入 {s.pending} 条
                        {s.misassigned > 0
                          ? ` · 待归并 ${s.misassigned} 条`
                          : ""}
                      </span>
                      <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                        <Button
                          className="h-11 min-w-0 px-3 sm:h-8"
                          size="sm"
                          variant={
                            s.pending > 0 || s.misassigned > 0
                              ? "default"
                              : "outline"
                          }
                          disabled={
                            s.pending + s.misassigned === 0 ||
                            harvestM.isPending
                          }
                          onClick={() => harvestM.mutate({ source: s.id })}
                        >
                          {harvestM.isPending &&
                          harvestM.variables?.source === s.id &&
                          !harvestM.variables.refresh ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Download />
                          )}
                          {s.misassigned > 0 && s.pending === 0
                            ? "归并到目标集"
                            : "纳入目标集"}
                        </Button>
                        {/* 回捞逻辑修好后刷新存量用例用；会覆盖手工改过的期望值，故与主按钮分开 */}
                        <Button
                          className="h-11 min-w-0 px-3 sm:h-8"
                          size="sm"
                          variant="ghost"
                          title="按来源重新生成已纳入的用例（保留用例 id 与历史结果关联，会覆盖手工改过的期望值与断言）"
                          disabled={s.total === s.pending || harvestM.isPending}
                          onClick={() =>
                            harvestM.mutate({ source: s.id, refresh: true })
                          }
                        >
                          {harvestM.isPending && harvestM.variables?.refresh ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <RefreshCw />
                          )}
                          重新生成
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        ) : sourcesQ.isLoading ? (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            正在核对样本来源与数据集归属…
          </p>
        ) : sourcesQ.isError ? (
          <p className="text-xs text-[var(--color-danger)]">
            样本来源加载失败：{(sourcesQ.error as Error).message}
          </p>
        ) : (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            暂无样本来源。业务系统咨询里把 AI
            登记的缺陷「确认」或「驳回」后，这里就会出现可纳入的样本。
          </p>
        )}
        {harvestM.isError && (
          <p className="mt-2 text-xs text-[var(--color-danger)]">
            {(harvestM.error as Error).message}
          </p>
        )}
        {harvestM.isSuccess && (
          <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            数据集「{harvestM.data.dataset}」：新纳入 {harvestM.data.created} 条
            {harvestM.data.updated > 0
              ? `，重新生成 ${harvestM.data.updated} 条`
              : ""}
            {harvestM.data.moved > 0 ? `，归并 ${harvestM.data.moved} 条` : ""}
            {harvestM.data.skipped > 0
              ? `，跳过 ${harvestM.data.skipped} 条（此前已纳入）`
              : ""}
            。
          </p>
        )}
      </section>

      {/* ───── 发起评测 ───── */}
      <section className="grid min-w-0 gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        <label className="flex min-w-0 flex-col gap-1.5 text-xs text-[var(--color-muted-foreground)]">
          数据集
          <select
            className="h-11 min-w-0 w-full max-w-full rounded-md border bg-[var(--color-background)] px-3 text-sm sm:h-10"
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

        <label className="flex min-w-0 flex-col gap-1.5 text-xs text-[var(--color-muted-foreground)]">
          被测 Agent / 能力
          <select
            className="h-11 min-w-0 w-full max-w-full rounded-md border bg-[var(--color-background)] px-3 text-sm sm:h-10"
            value={adapter}
            onChange={(e) => setAdapter(e.target.value)}
          >
            <option value="">选择被测 Agent…</option>
            {adaptersQ.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {adapterDisplayName(a.id)}（{a.scenario}）
              </option>
            ))}
          </select>
        </label>

        <Button
          className="h-11 w-full sm:col-span-2 lg:col-span-1 lg:w-auto"
          disabled={!canStart}
          onClick={() => startM.mutate()}
        >
          {startM.isPending ? <Loader2 className="animate-spin" /> : <Play />}
          开始评测
        </Button>

        {startM.isError && (
          <span className="text-xs text-[var(--color-danger)] sm:col-span-2 lg:col-span-3">
            {(startM.error as Error).message}
          </span>
        )}
      </section>

      <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 lg:min-h-0 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* ───── 运行历史 ───── */}
        <aside className="flex max-h-80 min-w-0 flex-col rounded-lg border lg:max-h-none lg:min-h-0">
          <div className="border-b px-3 py-2 text-sm font-medium">运行历史</div>
          <div className="min-h-0 flex-1 overflow-auto">
            {runsQ.data?.length === 0 && (
              <p className="p-4 text-xs text-[var(--color-muted-foreground)]">
                还没有运行记录。
              </p>
            )}
            {runsQ.data?.map((run) => (
              <div
                key={run.id}
                onClick={() => setSelectedRun(run.id)}
                className={`cursor-pointer border-b px-3 py-2 text-xs transition-colors hover:bg-[var(--color-accent)] ${
                  selectedRun === run.id ? "bg-[var(--color-accent)]" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{run.dataset}</span>
                  <StatusBadge
                    tone={RUN_STATUS_TONE[run.status] ?? "neutral"}
                    pulse={run.status === "RUNNING"}
                  >
                    {run.status}
                  </StatusBadge>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[var(--color-muted-foreground)]">
                  <span className="text-[var(--color-success)]">
                    {run.passed} 过
                  </span>
                  <span className="text-[var(--color-danger)]">
                    {run.failed} 挂
                  </span>
                  {run.errored > 0 && (
                    <span className="text-[var(--color-warning)]">
                      {run.errored} 错
                    </span>
                  )}
                  <span>/ {run.total}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--color-muted-foreground)]">
                  <span>
                    {run.adapter}
                    {run.promptVersion != null &&
                      ` · prompt v${run.promptVersion}`}
                  </span>
                  <span>{fmtTime(run.startedAt)}</span>
                </div>
                <div className="mt-1 flex gap-2">
                  <button
                    className="text-[10px] underline-offset-2 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBaseRun(run.id);
                    }}
                  >
                    设为基线
                  </button>
                  <button
                    className="text-[10px] text-[var(--color-danger)] underline-offset-2 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(run);
                    }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* ───── 详情 ───── */}
        <main className="flex min-w-0 flex-col gap-4 lg:min-h-0 lg:overflow-auto">
          {!selectedRun && (
            <div className="rounded-lg border p-8 text-center text-sm text-[var(--color-muted-foreground)]">
              选择左侧一次运行查看结果，或再选一次「设为基线」做退化对比。
            </div>
          )}

          {/* 混淆矩阵：通过率会被大量非 BUG 用例稀释，误报率才是这条链路的风险面 */}
          {summaryQ.data && (
            <section className="rounded-lg border p-4">
              <h2 className="mb-1 text-sm font-medium">
                抽取判定质量（只看 isBug 这一项）
              </h2>
              <p className="mb-3 text-xs text-[var(--color-muted-foreground)]">
                这组数字只衡量「是不是缺陷」判对没有，不看 type/severity/module
                等字段。 所以它可以是
                100%，而上面的用例仍然整条判负——那是字段答错，不是判定答错。两者口径不同，不矛盾。
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric
                  label="精确率 Precision"
                  value={pct(summaryQ.data.precision)}
                  hint="判为 BUG 的里有多少真是"
                />
                <Metric
                  label="召回率 Recall"
                  value={pct(summaryQ.data.recall)}
                  hint="真 BUG 里抓到了多少"
                />
                <Metric label="F1" value={pct(summaryQ.data.f1)} />
                <Metric
                  label="误报 / 漏报"
                  value={`${summaryQ.data.falsePositive} / ${summaryQ.data.falseNegative}`}
                  hint="误报直接消耗人工核实成本"
                />
              </div>
              {summaryQ.data.falsePositive + summaryQ.data.trueNegative ===
                0 && (
                <p className="mt-3 flex items-start gap-2 rounded-md border border-[var(--color-warning)] p-2 text-xs text-[var(--color-warning)]">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    该数据集没有负样本（期望 isBug=false 的用例），精确率必然是
                    100%——
                    模型无脑一律答「是缺陷」也能拿满分。先纳入负样本，这组数字才有意义。
                  </span>
                </p>
              )}
            </section>
          )}

          {/* 退化对比 */}
          {diffQ.data && (
            <section className="rounded-lg border p-4">
              <h2 className="mb-3 flex flex-wrap items-center gap-2 text-sm font-medium">
                <GitCompare className="size-4" />
                与基线对比
                <span className="w-full font-normal text-[var(--color-muted-foreground)] sm:w-auto">
                  {fmtTime(diffQ.data.base.startedAt)} →{" "}
                  {fmtTime(diffQ.data.target.startedAt)}
                </span>
              </h2>
              <div className="mb-3 flex flex-wrap gap-2 text-xs">
                <StatusBadge tone="danger">
                  退化 {diffQ.data.regressed.length}
                </StatusBadge>
                <StatusBadge tone="success">
                  修复 {diffQ.data.fixed.length}
                </StatusBadge>
                <StatusBadge tone="warning">
                  仍失败 {diffQ.data.stillFailing.length}
                </StatusBadge>
                <StatusBadge tone="neutral">
                  稳定通过 {diffQ.data.unchangedPass}
                </StatusBadge>
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
                          <div
                            key={i}
                            className="mt-1 pl-5 text-[var(--color-muted-foreground)]"
                          >
                            <code>{a.path}</code>：{a.message ?? "未通过"}
                          </div>
                        ))}
                      {d.targetError && (
                        <div className="mt-1 pl-5">{d.targetError}</div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  无退化项。
                </p>
              )}
            </section>
          )}

          {/* 逐用例结果 */}
          {selectedRun && (
            <section className="rounded-lg border">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 text-sm font-medium">
                <span>逐用例结果</span>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {resultsQ.data?.some(
                    (item) => item.scoreExportStatus === "FAILED",
                  ) && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={retryScoreM.isPending}
                      onClick={() => retryScoreM.mutate(selectedRun)}
                    >
                      <RefreshCw
                        className={`size-3 ${retryScoreM.isPending ? "animate-spin" : ""}`}
                      />
                      重试 Score 导出
                    </Button>
                  )}
                  {baseRun && baseRun !== selectedRun && (
                    <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
                      基线已选，对比见上方
                    </span>
                  )}
                </div>
              </div>
              <div className="divide-y">
                {resultsQ.data?.map((r) => (
                  <ResultRow key={r.id} result={r} />
                ))}
                {resultsQ.data?.length === 0 && (
                  <p className="p-4 text-xs text-[var(--color-muted-foreground)]">
                    {currentRun?.status === "RUNNING"
                      ? "运行中，结果逐条产出…"
                      : "这次运行没有产生任何结果——通常是数据集里没有启用的用例。"}
                  </p>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {hint && (
        <div className="mt-0.5 text-[10px] text-[var(--color-muted-foreground)]">
          {hint}
        </div>
      )}
    </div>
  );
}

function ResultRow({ result }: { result: EvalResult }) {
  const [open, setOpen] = useState(false);
  const assertions = parseAssertions(result.assertionsJson);
  const failed = assertions.filter((a) => !a.passed);

  return (
    <div className="min-w-0 px-4 py-3 text-xs">
      <div
        className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 sm:flex"
        onClick={() => setOpen((v) => !v)}
      >
        {result.verdict === "PASS" ? (
          <CheckCircle2 className="size-3.5 text-[var(--color-success)]" />
        ) : (
          <XCircle className="size-3.5 text-[var(--color-danger)]" />
        )}
        <span className="flex-1 truncate">
          {result.caseTitle ?? result.caseId}
        </span>
        <StatusBadge
          tone={VERDICT_TONE[result.verdict] ?? "neutral"}
          dot={false}
        >
          {result.verdict}
        </StatusBadge>
        <span className="col-start-2 tabular-nums text-[var(--color-muted-foreground)] sm:col-auto">
          {pct(result.score)}
        </span>
        <span className="tabular-nums text-[var(--color-muted-foreground)]">
          {result.latencyMs}ms
        </span>
        <span className="col-span-2 col-start-2 text-[10px] text-[var(--color-muted-foreground)] sm:col-auto">
          Score {result.scoreExportStatus}
        </span>
      </div>

      {!open && failed.length > 0 && (
        <div className="mt-1 pl-5 text-[var(--color-muted-foreground)]">
          {failed.length} 条断言未通过：{failed.map((a) => a.path).join("、")}
        </div>
      )}

      {open && (
        <div className="mt-3 min-w-0 space-y-3 sm:pl-5">
          {result.error && (
            <div className="text-[var(--color-warning)]">{result.error}</div>
          )}
          {result.traceId && (
            <button
              type="button"
              onClick={() =>
                void navigator.clipboard.writeText(result.traceId!)
              }
              className="inline-flex max-w-full items-center gap-1 rounded border px-2 py-2 font-mono text-[10px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
              title="复制 Trace ID"
            >
              <Copy className="size-3 shrink-0" />
              <span className="truncate">{result.traceId}</span>
            </button>
          )}
          {result.scoreExportError && (
            <div className="text-[var(--color-warning)]">
              Score 导出失败：{result.scoreExportError}
            </div>
          )}
          {assertions.length > 0 && (
            <div className="max-w-full overflow-x-auto">
              <table className="min-w-[32rem] text-[11px]">
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
                    <tr
                      key={i}
                      className={a.passed ? "" : "text-[var(--color-danger)]"}
                    >
                      <td className="pr-2">
                        <code>{a.path}</code>
                      </td>
                      <td className="pr-2">{a.type}</td>
                      <td className="pr-2">{a.expected ?? "—"}</td>
                      <td>{a.actual ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.rawOutput && (
            <details>
              <summary className="cursor-pointer text-[var(--color-muted-foreground)]">
                原始输出
              </summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-[var(--color-muted)] p-2">
                {result.rawOutput}
              </pre>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
