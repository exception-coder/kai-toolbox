import { useState } from "react";
import type { AgentManagementSnapshot } from "../api";
import { useTeachingAgent } from "./useTeachingAgent";
import { Intro, TeachingConfiguration, teachingTabs, type TeachingTab } from "./TeachingConfiguration";
import { TeachingTrial } from "./TeachingTrial";
import { TeachingRunView, TeachingEvaluationView } from "./TeachingRunView";
import "./teaching.css";

export function TeachingAgentDetail({ agent }: { agent: AgentManagementSnapshot }) {
  const { setVersion, query, draft, setDraft, result, setResult, evaluation, setEvaluation, save, run, evaluate, busy, error } = useTeachingAgent();
  const [tab, setTab] = useState<TeachingTab>("contract");
  if (!query.data) return <div role="status">{query.isLoading ? "正在读取教学配置…" : "教学配置读取失败"}
    {query.isError && <button className="teaching-button ml-3" onClick={() => query.refetch()}>重试</button>}</div>;
  const data = query.data;
  const config = draft ?? data.config;
  const dirty = JSON.stringify(config) !== JSON.stringify(data.config);
  return <div className="teaching-detail mx-auto max-w-5xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs text-muted-foreground">教学案例 · AgentScope Java 2.0.3</p>
        <h2 className="mt-1 text-xl font-semibold">{agent.name}</h2>
        <p className="mt-2 text-sm text-muted-foreground">从一句订单描述到可校验草稿。只读模拟 ERP，所有草稿均未提交。</p></div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm">配置版本<select className="teaching-input" value={data.version} disabled={busy || dirty}
          onChange={event => { setVersion(Number(event.target.value)); setDraft(null); }}>
          {agent.versions.map(item => <option key={item.version} value={item.version}>v{item.version} · {item.status}</option>)}
        </select></label>
        <button className="teaching-primary" disabled={busy || !dirty} onClick={() => save.mutate(config)}>
          {save.isPending ? "保存中…" : "保存候选版本"}</button>
        {dirty && <button className="teaching-button" disabled={busy} onClick={() => setDraft(null)}>撤销编辑</button>}
      </div>
    </header>
    <nav aria-label="教学 Agent 六块能力" className="flex flex-wrap gap-x-5 gap-y-2 border-b border-border">
      {teachingTabs.map(([key, title], index) => <button key={key} type="button" aria-current={tab === key ? "page" : undefined}
        onClick={() => setTab(key)} className={"border-b-2 py-3 text-sm " + (tab === key ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground")}>
        <span className="mr-2 font-mono text-xs">{String(index + 1).padStart(2, "0")}</span>{title}</button>)}
    </nav>
    {error && <div role="alert" className="border-l-2 border-destructive pl-3 text-sm">
      {error instanceof Error ? error.message : "操作未完成，请重试"}<button className="teaching-button ml-3" onClick={() => {
        save.reset(); run.reset(); evaluate.reset(); void query.refetch();
      }}>重试读取</button></div>}
    <fieldset disabled={busy} className="min-w-0">
      {!["evaluation", "runs"].includes(tab) && <TeachingConfiguration tab={tab} config={config} onChange={setDraft} />}
    </fieldset>
    {tab === "evaluation" && <section className="space-y-5">
      <Intro title="用相同样本比较配置" text="五个样本覆盖完整订单、歧义、缺失、非法数量与数量修改。改变数量上限后重新评测，可以观察规则变化产生的差异。" />
      <div className="flex flex-wrap gap-3"><button className="teaching-primary" disabled={busy || dirty} onClick={() => evaluate.mutate("DEMO")}>运行脚本回归</button>
        <button className="teaching-button" disabled={busy || dirty || !data.liveAvailable} onClick={() => evaluate.mutate("LIVE")}>运行真实模型回归</button></div>
      {evaluate.isPending && <p role="status">正在逐个执行样本，请等待；每个样本受整轮超时约束。</p>}
      <div className="flex flex-wrap gap-2">{data.evaluations.map(item => <button className="teaching-button" key={item.id}
        onClick={() => setEvaluation(item)}>v{item.version} · {item.mode} · {item.score}% · {new Date(item.createdAt).toLocaleTimeString()}</button>)}</div>
      {(evaluation ?? data.evaluations[0]) ? <TeachingEvaluationView evaluation={(evaluation ?? data.evaluations[0])!} />
        : <p className="text-sm text-muted-foreground">尚无评测记录。运行脚本回归即可查看每个样本的标准答案与实际结果。</p>}
    </section>}
    {tab === "runs" && <section className="space-y-5">
      <Intro title="记录实际发生的步骤" text="每条记录关联配置版本和运行 ID。Token 为供应商报告值，脚本或未返回用量时显示未提供。这里展示执行事件，不展示内部思维链。" />
      <div className="flex flex-wrap gap-2">{data.runs.map(item => <button className="teaching-button" key={item.id} onClick={() => setResult(item)}>
        v{item.version} · {item.mode} · {new Date(item.createdAt).toLocaleTimeString()}</button>)}</div>
      {!data.runs.length && <p className="text-sm text-muted-foreground">暂无运行记录，请在下方选择样本并试运行。</p>}
    </section>}
    <TeachingTrial scenarios={data.scenarios} liveAvailable={data.liveAvailable} dirty={dirty} busy={busy} result={result}
      onRun={(mode, scenario, input, previous) => run.mutate({ version: data.version, mode, scenarioId: scenario.id, input, previous })} />
    {run.isPending && <p role="status" className="text-sm text-muted-foreground">Agent 正在执行，完成后展示工具、校验和模型调用记录。</p>}
    {result && <TeachingRunView run={result} />}
  </div>;
}
