import type { Run, Evaluation } from "./api";

export function TeachingRunView({ run }: { run: Run }) {
  return <section className="min-w-0 space-y-5" aria-label="运行结果">
    <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-border pb-4 text-xs text-muted-foreground">
      <span>v{run.version} · {run.mode === "DEMO" ? "固定脚本演示" : "真实模型"}</span>
      <span>{run.status}</span><span>{run.elapsedMs} ms</span>
      <span>Token：{run.tokens ?? "未提供"}</span>
      <span className="break-all font-mono">Run {run.id}</span>
    </div>
    <p className="whitespace-pre-wrap text-sm leading-6">{run.answer}</p>
    {run.draft && <div>
      <h4 className="mb-2 text-sm font-medium">结构化草稿 · 未提交</h4>
      <pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs leading-6">{JSON.stringify(run.draft, null, 2)}</pre>
      {run.draft.issues.length > 0 && <ul className="mt-3 list-inside list-disc text-sm text-warning-soft-foreground">
        {run.draft.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
    </div>}
    <div><h4 className="mb-3 text-sm font-medium">执行时间线</h4>
      <ol className="space-y-3 border-l border-border pl-4">
        {run.steps.map((step, index) => <li key={index} className="text-sm">
          <div className="flex gap-3 text-xs text-muted-foreground"><span>{step.elapsedMs} ms</span><span>{step.type}</span></div>
          <p className="mt-1 break-words leading-6">{step.detail}</p>
        </li>)}
      </ol>
    </div>
  </section>;
}

export function TeachingEvaluationView({ evaluation }: { evaluation: Evaluation }) {
  return <section className="space-y-4">
    <p className="text-sm">v{evaluation.version} · {evaluation.mode === "DEMO" ? "脚本回归" : "真实模型回归"} ·
      精确匹配率 {evaluation.score}% · {evaluation.passed ? "达到教学阈值" : "未达到教学阈值"}</p>
    <p className="text-xs text-muted-foreground">阈值 95%。比较 status、sku、quantity；教学数据不授予生产发布资格。</p>
    <div className="divide-y divide-border">
      {evaluation.cases.map(item => <details key={item.scenario.id} className="py-3">
        <summary className="cursor-pointer text-sm">{item.scenario.title} · {item.differences.length ? "未通过" : "通过"}</summary>
        <p className="mt-2 text-xs leading-6">输入：{item.scenario.input}<br />
          期望：{item.scenario.expectedStatus} / {item.scenario.expectedSku ?? "null"} / {item.scenario.expectedQuantity ?? "null"}</p>
        {item.differences.map(diff => <p key={diff} className="mt-1 text-sm text-destructive">{diff}</p>)}
        <div className="mt-4"><TeachingRunView run={item.actual} /></div>
      </details>)}
    </div>
  </section>;
}
