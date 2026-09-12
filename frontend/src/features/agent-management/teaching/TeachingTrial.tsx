import { useState } from "react";
import type { OrderDraft, Run, Scenario } from "./api";

export function TeachingTrial({ scenarios, liveAvailable, busy, dirty, onRun, result }: {
  scenarios: Scenario[]; liveAvailable: boolean; busy: boolean; dirty: boolean;
  onRun: (mode: "DEMO" | "LIVE", scenario: Scenario, input: string, previous: OrderDraft | null) => void;
  result: Run | null;
}) {
  const [scenarioId, setScenarioId] = useState(scenarios[0]?.id ?? "");
  const [mode, setMode] = useState<"DEMO" | "LIVE">("DEMO");
  const scenario = scenarios.find(item => item.id === scenarioId) ?? scenarios[0];
  const [input, setInput] = useState(scenario?.input ?? "");
  const [usePrevious, setUsePrevious] = useState(false);
  if (!scenario) return <p>暂无教学样本，请刷新重试。</p>;
  return <section className="space-y-4 border-t border-border pt-5">
    <h3 className="text-base font-medium">试运行</h3>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm">运行模式<select className="teaching-input" value={mode} disabled={busy}
        onChange={event => setMode(event.target.value as "DEMO" | "LIVE")}>
        <option value="DEMO">固定场景演示 · 无需密钥</option>
        <option value="LIVE" disabled={!liveAvailable}>真实模型{!liveAvailable ? " · 请先配置统一网关" : ""}</option>
      </select></label>
      <label className="text-sm">教学样本<select className="teaching-input" value={scenarioId} disabled={busy}
        onChange={event => { setScenarioId(event.target.value); setInput(scenarios.find(s => s.id === event.target.value)?.input ?? ""); setUsePrevious(false); }}>
        {scenarios.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}
      </select></label>
    </div>
    <p className="text-xs leading-5 text-muted-foreground">{mode === "DEMO"
      ? "脚本仅模拟模型响应，工具循环与 Java 校验实际执行。修改提示词或模型参数不会影响脚本。"
      : "将通过统一网关产生实际模型调用；使用已保存配置。"}完成后可查看完整时间线。</p>
    <label className="block text-sm">订单输入<textarea className="teaching-input min-h-24" maxLength={4000}
      readOnly={mode === "DEMO"} disabled={busy} value={mode === "DEMO" ? scenario.input : input}
      onChange={event => setInput(event.target.value)} /></label>
    {mode === "LIVE" && result?.draft && <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={usePrevious} disabled={busy} onChange={event => setUsePrevious(event.target.checked)} />
      携带上一份已校验草稿，演示“改成 120 件”
    </label>}
    {scenario.previous && <p className="text-xs text-muted-foreground">样本初始草稿：{scenario.previous.styleCode} / {scenario.previous.quantity} 件</p>}
    <button type="button" className="teaching-primary" disabled={busy || dirty || (mode === "LIVE" && !input.trim())}
      onClick={() => onRun(mode, scenario, mode === "DEMO" ? scenario.input : input, usePrevious ? result?.draft ?? null : scenario.previous)}>
      {busy ? "正在运行…" : "运行已保存版本"}
    </button>
    {dirty && <p className="text-xs text-warning-soft-foreground">配置有改动，请先保存候选版本。</p>}
  </section>;
}
