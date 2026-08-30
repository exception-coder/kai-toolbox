import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Bot,
  Boxes,
  Check,
  ChevronRight,
  GitCompareArrows,
  Loader2,
  RotateCcw,
  Save,
  ShieldCheck,
} from "lucide-react";
import {
  createBusinessConsultCandidate,
  getBusinessConsultAgent,
  releaseBusinessConsultCandidate,
  rollbackBusinessConsultVersion,
  type AgentCapability,
  type AgentManagementSnapshot,
  type AgentVersion,
  type CapabilityType,
  type CreateAgentVersionRequest,
  type OrchestrationVersion,
} from "../api";

const QUERY_KEY = ["agent-management", "business-consult"];
type DetailTab = "overview" | "capabilities" | "evaluation" | "versions";

/** 公司 Agent Registry 与能力治理工作台。 */
export function AgentManagementPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEY,
    queryFn: getBusinessConsultAgent,
  });
  const [draft, setDraft] = useState<CreateAgentVersionRequest | null>(null);
  const [tab, setTab] = useState<DetailTab>("overview");
  const refresh = (snapshot: AgentManagementSnapshot) => {
    queryClient.setQueryData(QUERY_KEY, snapshot);
    setDraft(null);
  };
  const save = useMutation({
    mutationFn: createBusinessConsultCandidate,
    onSuccess: refresh,
  });
  const release = useMutation({
    mutationFn: releaseBusinessConsultCandidate,
    onSuccess: refresh,
  });
  const rollback = useMutation({
    mutationFn: rollbackBusinessConsultVersion,
    onSuccess: refresh,
  });
  const error = query.error ?? save.error ?? release.error ?? rollback.error;
  useEffect(() => {
    const baseline =
      query.data?.candidateVersion ?? query.data?.productionVersion;
    if (baseline && !draft) setDraft(toDraft(baseline));
  }, [query.data, draft]);
  return (
    <main className="h-full min-h-0 overflow-y-auto bg-[#f7f8fa] text-slate-950">
      <header className="border-b border-slate-200 bg-white px-6 py-5 lg:px-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
          AI 治理 · AI Governance
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Agent 管理
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          管理 Agent、能力绑定、版本与质量，不管理 MCP 进程。
        </p>
      </header>
      <div className="grid min-h-[calc(100%-101px)] lg:grid-cols-[270px_minmax(0,1fr)]">
        <RegistryPanel
          snapshot={query.data ?? null}
          onCapabilities={() => setTab("capabilities")}
        />
        <section className="min-w-0 px-6 py-7 lg:px-10">
          {query.isLoading && <LoadingState />}
          {query.isError && (
            <RecoveryState
              detail={errorMessage(query.error)}
              onRetry={() => query.refetch()}
            />
          )}
          {query.data && draft && (
            <AgentDetail
              snapshot={query.data}
              draft={draft}
              tab={tab}
              onTabChange={setTab}
              onDraftChange={setDraft}
              onSave={() => save.mutate(draft)}
              onRelease={() =>
                query.data.candidateVersion &&
                release.mutate(query.data.candidateVersion.version)
              }
              onRollback={(version) => rollback.mutate(version)}
              busy={save.isPending || release.isPending || rollback.isPending}
              error={error ? errorMessage(error) : null}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function RegistryPanel({
  snapshot,
  onCapabilities,
}: {
  snapshot: AgentManagementSnapshot | null;
  onCapabilities: () => void;
}) {
  const registry = snapshot?.capabilityRegistry ?? [];
  const counts = registry.reduce<Record<string, number>>((result, item) => {
    result[item.type] = (result[item.type] ?? 0) + 1;
    return result;
  }, {});
  return (
    <aside className="border-b border-slate-200 bg-white px-4 py-5 lg:border-b-0 lg:border-r">
      <div className="px-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
        Agent 注册表 · Registry · 1
      </div>
      <div className="mt-3 flex items-start gap-3 rounded-lg bg-slate-100 px-3 py-3">
        <span className="mt-0.5 flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white">
          <Bot className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">
            {snapshot?.name ?? "业务咨询 Agent"}
          </span>
          <span className="mt-1 block text-xs text-slate-500">
            业务咨询 · 已登记
          </span>
        </span>
      </div>
      <button
        type="button"
        onClick={onCapabilities}
        className="mt-7 w-full border-t border-slate-200 pt-5 text-left"
      >
        <span className="flex items-center justify-between px-2 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
          <span>能力注册表 · Registry</span>
          <span>{registry.length}</span>
        </span>
        <span className="mt-3 flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50">
          <Boxes className="size-4 text-slate-500" />
          <span className="flex-1 text-sm">业务咨询能力</span>
          <ChevronRight className="size-4 text-slate-400" />
        </span>
        <span className="mt-2 block px-3 text-xs leading-5 text-slate-400">
          MCP 服务 {counts.MCP_SERVER ?? 0} · 工具 {counts.TOOL ?? 0} · 技能{" "}
          {counts.SKILL ?? 0}
        </span>
      </button>
    </aside>
  );
}

function AgentDetail(props: {
  snapshot: AgentManagementSnapshot;
  draft: CreateAgentVersionRequest;
  tab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onDraftChange: (draft: CreateAgentVersionRequest) => void;
  onSave: () => void;
  onRelease: () => void;
  onRollback: (version: number) => void;
  busy: boolean;
  error: string | null;
}) {
  const { snapshot, draft } = props;
  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <section className="flex flex-col justify-between gap-5 sm:flex-row">
        <div>
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500" />
            <h2 className="text-lg font-semibold">{snapshot.name}</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            {snapshot.description}
          </p>
          <p className="mt-3 text-xs text-slate-400">
            {snapshot.owner} · {snapshot.framework} ·{" "}
            <span className="font-mono">{snapshot.endpoint}</span>
          </p>
        </div>
        <div className="flex gap-8">
          <Metric
            label="生产版本 · Production"
            value={versionLabel(snapshot.productionVersion)}
          />
          <Metric
            label="候选版本 · Candidate"
            value={versionLabel(snapshot.candidateVersion)}
          />
        </div>
      </section>
      <nav
        className="flex gap-6 border-b border-slate-200"
        aria-label="Agent 管理视图"
      >
        {(
          [
            ["overview", "概览"],
            ["capabilities", "能力"],
            ["evaluation", "评测"],
            ["versions", "版本"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => props.onTabChange(id)}
            className={`border-b-2 pb-3 text-sm ${props.tab === id ? "border-slate-950 font-medium text-slate-950" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      {props.tab === "overview" && (
        <OverviewEditor draft={draft} onChange={props.onDraftChange} />
      )}
      {props.tab === "capabilities" && (
        <CapabilityEditor
          registry={snapshot.capabilityRegistry ?? []}
          productionIds={snapshot.productionCapabilityIds ?? []}
          draft={draft}
          onChange={props.onDraftChange}
        />
      )}
      {props.tab === "evaluation" && (
        <EvaluationEditor
          snapshot={snapshot}
          draft={draft}
          onChange={props.onDraftChange}
        />
      )}
      {props.tab === "versions" && (
        <VersionHistory
          versions={snapshot.versions}
          onRollback={props.onRollback}
          busy={props.busy}
        />
      )}
      {props.error && (
        <p className="border-l-2 border-red-400 pl-3 text-sm text-red-600">
          {props.error}
        </p>
      )}
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-[#f7f8fa]/95 py-4 backdrop-blur">
        <p className="text-xs text-slate-400">
          保存后生成包含能力绑定的候选版本（Candidate）快照。
        </p>
        <div className="flex gap-2">
          <ActionButton
            onClick={props.onSave}
            disabled={props.busy}
            icon={<Save className="size-4" />}
            label="保存候选版本 · Candidate"
          />
          <ActionButton
            primary
            onClick={props.onRelease}
            disabled={props.busy || !snapshot.releaseGate.releasable}
            icon={<GitCompareArrows className="size-4" />}
            label="发布生产版本 · Production"
          />
        </div>
      </div>
    </div>
  );
}

function OverviewEditor({
  draft,
  onChange,
}: {
  draft: CreateAgentVersionRequest;
  onChange: (draft: CreateAgentVersionRequest) => void;
}) {
  return (
    <section>
      <SectionTitle
        title="版本配置"
        detail="模型、提示词（Prompt）与编排参数随候选版本（Candidate）固化；能力绑定在“能力”页维护。"
      />
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field
          label="模型 · Model"
          value={draft.model}
          onChange={(model) => onChange({ ...draft, model })}
        />
        <Field
          label="提示词引用 · Prompt ref"
          value={draft.promptRef}
          onChange={(promptRef) => onChange({ ...draft, promptRef })}
        />
        <Field
          label="随机度 · Temperature"
          type="number"
          value={String(draft.temperature)}
          onChange={(value) =>
            onChange({ ...draft, temperature: Number(value) })
          }
        />
        <label className="space-y-1.5 text-xs text-slate-500">
          <span>编排版本 · Orchestration</span>
          <select
            value={draft.orchestrationVersion}
            onChange={(event) =>
              onChange({
                ...draft,
                orchestrationVersion: event.target
                  .value as OrchestrationVersion,
              })
            }
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm"
          >
            {["v1", "v2", "v3", "v4"].map((version) => (
              <option key={version}>{version}</option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}

function CapabilityEditor({
  registry,
  productionIds,
  draft,
  onChange,
}: {
  registry: AgentCapability[];
  productionIds: string[];
  draft: CreateAgentVersionRequest;
  onChange: (draft: CreateAgentVersionRequest) => void;
}) {
  const candidateIds = new Set([
    ...draft.mcpServers.map((name) => `mcp:${name}`),
    ...draft.tools.map((name) => `tool:${name}`),
    ...draft.skills.map((name) => `skill:${name}`),
  ]);
  const toggle = (capability: AgentCapability) => {
    const selected = !candidateIds.has(capability.id);
    const key =
      capability.type === "MCP_SERVER"
        ? "mcpServers"
        : capability.type === "TOOL"
          ? "tools"
          : "skills";
    const values = selected
      ? unique([...draft[key], capability.name])
      : draft[key].filter((name) => name !== capability.name);
    let next = { ...draft, [key]: values };
    if (capability.type === "TOOL" && selected)
      next = {
        ...next,
        mcpServers: unique([...next.mcpServers, capability.source]),
      };
    if (capability.type === "MCP_SERVER" && !selected)
      next = {
        ...next,
        tools: next.tools.filter(
          (name) =>
            registry.find((item) => item.id === `tool:${name}`)?.source !==
            capability.name,
        ),
      };
    onChange(next);
  };
  return (
    <section>
      <SectionTitle
        title="能力注册表 · Capability Registry"
        detail="版本、权限与可用性来自能力契约；“已登记”不代表 MCP 进程在线。"
      />
      {(["MCP_SERVER", "TOOL", "SKILL"] as CapabilityType[]).map((type) => (
        <div key={type} className="mt-7">
          <h4 className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">
            {typeLabel(type)}
          </h4>
          <div className="mt-2 divide-y divide-slate-200 border-y border-slate-200">
            {registry
              .filter((item) => item.type === type)
              .map((capability) => (
                <CapabilityRow
                  key={capability.id}
                  capability={capability}
                  production={productionIds.includes(capability.id)}
                  candidate={candidateIds.has(capability.id)}
                  onToggle={() => toggle(capability)}
                />
              ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function CapabilityRow({
  capability,
  production,
  candidate,
  onToggle,
}: {
  capability: AgentCapability;
  production: boolean;
  candidate: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="grid gap-3 py-4 sm:grid-cols-[minmax(180px,1fr)_minmax(250px,1.5fr)_auto] sm:items-center">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium">
            {capability.name}
          </span>
          <span className="text-[10px] text-slate-400">
            {capability.version}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          来源 · {capability.source}
        </p>
      </div>
      <div>
        <p className="text-xs leading-5 text-slate-600">
          {capability.description}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Tag>
            {capability.permission === "READ_ONLY" ? "只读" : "指令约束"}
          </Tag>
          <Tag>{capability.riskLevel === "MEDIUM" ? "中风险" : "低风险"}</Tag>
          <Tag>
            {capability.availability === "REGISTERED"
              ? "已登记"
              : capability.availability}
          </Tag>
          {production && <Tag>生产版本 · Production</Tag>}
        </div>
        {capability.providedCapabilityIds.length > 0 && (
          <p className="mt-2 text-[11px] text-slate-400">
            提供{" "}
            {capability.providedCapabilityIds
              .map((id) => id.replace("tool:", ""))
              .join("、")}
          </p>
        )}
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={candidate}
          onChange={onToggle}
          className="size-4 accent-slate-950"
        />
        候选版本 · Candidate
      </label>
    </div>
  );
}

function EvaluationEditor({
  snapshot,
  draft,
  onChange,
}: {
  snapshot: AgentManagementSnapshot;
  draft: CreateAgentVersionRequest;
  onChange: (draft: CreateAgentVersionRequest) => void;
}) {
  const gate = snapshot.releaseGate;
  const observabilityUrl = snapshot.observabilityUrl ?? "http://127.0.0.1:6006";
  const dataset = snapshot.evaluationDataset;
  return (
    <section>
      <SectionTitle
        title="评测与发布门禁 · Evaluation & Release Gate"
        detail={gate.reason}
      />
      <div className="mt-6 border-y border-slate-200">
        <div className="flex flex-wrap items-end justify-between gap-3 py-4">
          <div>
            <p className="text-sm font-medium text-slate-900">
              经典历史问题 · Classic Questions
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {dataset
                ? `${dataset.id} · ${dataset.cases.length} 条真实历史问题`
                : "题集尚未载入"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-amber-700">
              待人工基线 · Pending baseline
            </span>
            <a
              href="/tools/eval"
              className="text-xs font-medium text-slate-700 hover:text-slate-950"
            >
              前往回归评测 →
            </a>
          </div>
        </div>
        {dataset?.cases.map((item, index) => (
          <div
            key={item.id}
            className="grid gap-2 border-t border-slate-200 py-4 sm:grid-cols-[2rem_10rem_1fr_auto] sm:items-start"
          >
            <span className="font-mono text-xs text-slate-400">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="text-xs font-medium text-slate-800">{item.title}</p>
              <p className="mt-1 text-[11px] text-slate-400">{item.coverage}</p>
            </div>
            <p
              className={`text-xs leading-5 ${item.status === "READY" ? "text-slate-600" : "text-amber-700"}`}
            >
              {item.question}
            </p>
            <span
              className={`text-[10px] uppercase tracking-wide ${item.status === "READY" ? "text-emerald-700" : "text-amber-700"}`}
            >
              {item.status === "READY"
                ? "已就绪 · Ready"
                : "来源缺失 · Missing"}
            </span>
          </div>
        ))}
        {!dataset && (
          <div className="border-t border-slate-200 py-4 text-xs text-slate-500">
            重启后端以加载题集快照；也可先进入回归评测检查样本来源。
          </div>
        )}
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field
          label="评测运行编号 · Evaluation run ID"
          value={draft.evaluationRunId ?? ""}
          onChange={(evaluationRunId) =>
            onChange({ ...draft, evaluationRunId })
          }
        />
        <Field
          label="评测分数 · Score"
          type="number"
          value={
            draft.evaluationScore == null ? "" : String(draft.evaluationScore)
          }
          onChange={(value) =>
            onChange({
              ...draft,
              evaluationScore: value ? Number(value) : null,
            })
          }
        />
      </div>
      <label className="mt-4 flex items-center gap-3 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={draft.evaluationPassed ?? false}
          onChange={(event) =>
            onChange({ ...draft, evaluationPassed: event.target.checked })
          }
          className="size-4 accent-slate-950"
        />
        确定性断言已通过
      </label>
      <div className="mt-6 flex flex-wrap items-center gap-4">
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${gate.releasable ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}
        >
          {gate.releasable ? (
            <Check className="size-3.5" />
          ) : (
            <ShieldCheck className="size-3.5" />
          )}
          最低分 {gate.minimumScore}
        </span>
        <a
          href={observabilityUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 text-xs text-slate-600 hover:text-slate-950"
        >
          <Activity className="size-3.5" />
          打开 Phoenix 调用链 · Trace
        </a>
      </div>
    </section>
  );
}

function VersionHistory({
  versions,
  onRollback,
  busy,
}: {
  versions: AgentVersion[];
  onRollback: (version: number) => void;
  busy: boolean;
}) {
  return (
    <section>
      <SectionTitle
        title="版本记录 · Versions"
        detail="版本同时固化配置、能力绑定与评测事实。"
      />
      <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
        {versions.map((version) => (
          <div key={version.version} className="flex items-center gap-4 py-3">
            <span className="w-10 font-mono text-sm">v{version.version}</span>
            <span className="w-24 text-[11px] tracking-wide text-slate-500">
              {version.status}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
              {version.model} ·{" "}
              {version.tools.length +
                version.mcpServers.length +
                version.skills.length}{" "}
              项能力 · {version.evaluationScore ?? "未评测"}
            </span>
            {version.status === "HISTORICAL" && version.releasedAt != null && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onRollback(version.version)}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                <RotateCcw className="size-3.5" />
                回滚
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-mono text-lg">{value}</p>
    </div>
  );
}
function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] text-slate-500">
      {children}
    </span>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number";
}) {
  return (
    <label className="space-y-1.5 text-xs text-slate-500">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500"
      />
    </label>
  );
}
function ActionButton({
  label,
  icon,
  onClick,
  disabled,
  primary = false,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40 ${primary ? "bg-slate-950 text-white hover:bg-slate-800" : "border border-slate-300 bg-white text-slate-700 hover:border-slate-400"}`}
    >
      {icon}
      {label}
    </button>
  );
}
function LoadingState() {
  return (
    <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500">
      <Loader2 className="size-4 animate-spin" />
      正在读取 Agent 注册表（Registry）
    </div>
  );
}
function RecoveryState({
  detail,
  onRetry,
}: {
  detail: string;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto mt-20 max-w-md border-l-2 border-amber-400 pl-4">
      <h2 className="text-sm font-medium">Agent 注册表（Registry）暂不可用</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium"
      >
        重新读取
        <ChevronRight className="size-3.5" />
      </button>
    </div>
  );
}
function toDraft(version: AgentVersion): CreateAgentVersionRequest {
  return {
    model: version.model,
    temperature: version.temperature,
    promptRef: version.promptRef,
    orchestrationVersion: version.orchestrationVersion,
    tools: version.tools,
    mcpServers: version.mcpServers,
    skills: version.skills,
    evaluationRunId: version.evaluationRunId,
    evaluationScore: version.evaluationScore,
    evaluationPassed: version.evaluationPassed,
  };
}
const unique = (values: string[]) => Array.from(new Set(values));
const typeLabel = (type: CapabilityType) =>
  type === "MCP_SERVER"
    ? "MCP 服务 · Servers"
    : type === "TOOL"
      ? "工具 · Tools"
      : "技能 · Skills";
const versionLabel = (version: AgentVersion | null) =>
  version ? `v${version.version}` : "未设置";
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "服务端未返回可用结果";
