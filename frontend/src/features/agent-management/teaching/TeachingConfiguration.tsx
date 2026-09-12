import type { TeachingConfig } from "./api";

export const teachingTabs = [
  ["contract", "输入输出"], ["parsing", "解析契约"], ["model", "模型与工具"],
  ["limits", "执行约束"], ["evaluation", "回归评测"], ["runs", "运行观测"],
] as const;
export type TeachingTab = typeof teachingTabs[number][0];
const fieldClass = "mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring";

export function TeachingConfiguration({ tab, config, onChange }: {
  tab: TeachingTab; config: TeachingConfig; onChange: (value: TeachingConfig) => void;
}) {
  const number = (key: keyof TeachingConfig, label: string, min: number, max: number, step = 1) => (
    <label className="block text-sm" key={key}>{label}
      <input className={fieldClass} type="number" min={min} max={max} step={step}
        value={config[key] as number} onChange={event => onChange({ ...config, [key]: Number(event.target.value) })} />
    </label>
  );
  if (tab === "contract") return <section className="space-y-5">
    <Intro title="结构化不等于业务正确" text="模型通过 propose_draft 提议字段，Java 决定草稿是否完整、款号是否唯一、数量是否合法。所有结果都是未提交的教学草稿。" />
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-sm">
      <dt>契约版本</dt><dd className="font-mono">order-draft/v1</dd>
      <dt>输入</dt><dd>原文（最多 4000 字符）、可选上一份草稿</dd>
      <dt>输出</dt><dd>styleCode / sku / quantity / status / issues</dd>
      <dt>状态</dt><dd>READY · NEEDS_CLARIFICATION · INVALID</dd>
      <dt>缺失值</dt><dd>null，保留缺失，不编造字段</dd>
    </dl>
    {number("maxQuantity", "数量上限（Java 强制校验）", 1, 100000)}
  </section>;
  if (tab === "parsing") return <section className="space-y-5">
    <Intro title="模型理解，代码裁决" text="提示词决定提取与澄清策略；输入校验和数量上限不会因提示词修改而失效。修改数量时，显式携带上一份草稿。" />
    <label className="block text-sm">系统提示词<textarea className={fieldClass + " min-h-72 leading-6"} maxLength={8000}
      value={config.prompt} onChange={event => onChange({ ...config, prompt: event.target.value })} /></label>
    <p className="text-xs leading-5 text-muted-foreground">固定脚本模式不理解提示词。要验证提示词变化，请切换真实模型并重新评测。</p>
  </section>;
  if (tab === "model") return <section className="space-y-5">
    <Intro title="一个模型，两项只读能力" text="真实调用使用平台统一 LLM 网关，当前页只选择模型，不保存或显示 API Key。ERP 数据是固定教学样本。" />
    <label className="block text-sm">模型名称<input className={fieldClass} maxLength={100} value={config.model}
      onChange={event => onChange({ ...config, model: event.target.value })} /></label>
    {number("temperature", "Temperature", 0, 2, 0.1)}
    <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={config.lookupEnabled}
      onChange={event => onChange({ ...config, lookupEnabled: event.target.checked })} />启用 lookup_sku 查询工具</label>
    <p className="text-sm leading-6">propose_draft 始终启用，校验与结果生成不可绕过。MCP 与 Skill 本案例未接入。</p>
  </section>;
  return <section className="space-y-5">
    <Intro title="每次运行都有边界" text="超时覆盖整个 Agent 调用；SDK 请求使用统一重试预算，不再叠加应用层重试。单实例同时只运行一个教学任务。" />
    <div className="grid gap-4 sm:grid-cols-2">
      {number("maxIterations", "最大 ReAct 轮数", 1, 12)}
      {number("timeoutSeconds", "整轮超时（秒）", 1, 90)}
      {number("retries", "模型额外重试次数", 0, 2)}
      {number("maxOutputTokens", "每次模型输出 Token 上限", 128, 4096)}
    </div>
    <p className="text-xs leading-5 text-muted-foreground">输出 Token 上限不是总费用硬预算。实际输入与输出用量在运行后查看；未返回用量时显示“未提供”。</p>
  </section>;
}

export function Intro({ title, text }: { title: string; text: string }) {
  return <div><h3 className="text-base font-medium">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div>;
}
