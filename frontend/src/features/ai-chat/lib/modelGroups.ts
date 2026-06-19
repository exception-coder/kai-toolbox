import type { ModelInfo } from '../types'

/** 按平台分组后的一组模型。 */
export interface ModelGroup {
  key: string
  label: string
  models: ModelInfo[]
}

// 按模型 id 关键词推断所属平台。顺序即展示顺序，'other' 兜底。
const RULES: { key: string; label: string; re: RegExp }[] = [
  { key: 'openai', label: 'OpenAI · GPT', re: /\bgpt|^o[1-9]|chatgpt|openai|davinci|dall-?e|whisper|codex/ },
  { key: 'anthropic', label: 'Claude · Anthropic', re: /claude|anthropic|sonnet|opus|haiku/ },
  { key: 'google', label: 'Gemini · Google', re: /gemini|palm|bison|gemma|imagen/ },
  { key: 'deepseek', label: 'DeepSeek', re: /deepseek/ },
  { key: 'qwen', label: '通义千问 · Qwen', re: /qwen|qwq|tongyi/ },
  { key: 'zhipu', label: '智谱 · GLM', re: /glm|chatglm/ },
  { key: 'moonshot', label: 'Kimi · Moonshot', re: /moonshot|kimi/ },
  { key: 'xai', label: 'Grok · xAI', re: /grok/ },
  { key: 'doubao', label: '豆包 · Doubao', re: /doubao|volc/ },
  { key: 'meta', label: 'Llama · Meta', re: /llama/ },
  { key: 'mistral', label: 'Mistral', re: /mistral|mixtral|codestral/ },
  { key: 'yi', label: '零一万物 · Yi', re: /\byi-|yi-?large|yi-?lightning/ },
  { key: 'baidu', label: '文心 · ERNIE', re: /ernie|wenxin/ },
]

const ORDER = [...RULES.map((r) => r.key), 'other']
const LABELS: Record<string, string> = { other: '其他', ...Object.fromEntries(RULES.map((r) => [r.key, r.label])) }

// 供应商配色圆点（参考各家品牌主色）：用户一眼分辨「现在是谁在干活」。
const DOTS: Record<string, string> = {
  openai: 'bg-emerald-500',
  anthropic: 'bg-orange-500',
  google: 'bg-blue-500',
  deepseek: 'bg-indigo-500',
  qwen: 'bg-violet-500',
  zhipu: 'bg-cyan-500',
  moonshot: 'bg-slate-500',
  xai: 'bg-neutral-700 dark:bg-neutral-300',
  doubao: 'bg-rose-500',
  meta: 'bg-sky-500',
  mistral: 'bg-amber-500',
  yi: 'bg-teal-500',
  baidu: 'bg-red-500',
  other: 'bg-gray-400',
}

/** 推断单个模型 id 的平台。 */
export function modelPlatform(id: string): { key: string; label: string } {
  const lid = (id || '').toLowerCase()
  for (const r of RULES) if (r.re.test(lid)) return { key: r.key, label: r.label }
  return { key: 'other', label: LABELS.other }
}

/** 模型 id 对应供应商配色圆点的 tailwind 类。 */
export function modelDot(id: string): string {
  return DOTS[modelPlatform(id).key] ?? DOTS.other
}

// 推理/档位关键词权重（命中最高档一次）。模型命名里本就编码了能力档位。
const TIER: { re: RegExp; w: number }[] = [
  { re: /o3|o4|reasoner|thinking|xhigh|x-high/, w: 6 },
  { re: /opus|ultra|\bmax\b|\bpro\b|\bo1\b/, w: 5 },
  { re: /\bhigh\b/, w: 4 },
  { re: /\bplus\b|sonnet/, w: 3 },
  { re: /\bmedium\b/, w: 2 },
  { re: /\blow\b/, w: 1 },
]

/**
 * 模型推理能力的确定性启发式评分（越高越强），纯按 id 关键词与代际推断，不依赖远端数据。
 * 主权重取 id 中最大的版本号（代际，如 gpt-5.5 的 5.5），叠加最高命中的档位权重，
 * 轻量/快档（nano/mini/flash/haiku…）降权。仅用于「按推理力」的相对次序，非绝对能力分。
 */
export function modelReasoningScore(id: string): number {
  const s = (id || '').toLowerCase()
  let score = 0
  const versions = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number)
  if (versions.length) score += Math.max(...versions)
  for (const t of TIER) if (t.re.test(s)) { score += t.w; break }
  if (/nano/.test(s)) score -= 4
  else if (/mini/.test(s)) score -= 2
  else if (/lite|flash|haiku|small|air|turbo/.test(s)) score -= 1.5
  return score
}

// 用于筛选/展示的能力标签（排除上下文长度这类非能力标签，如 200K）。顺序即展示顺序。
export const CAPABILITY_TAGS = ['推理', '工具', '文件', '多模态'] as const

/** 该模型的能力标签（仅 CAPABILITY_TAGS 子集，供筛选与徽章）。 */
export function capabilityTags(m: ModelInfo): string[] {
  const tags = m.tags ?? []
  return CAPABILITY_TAGS.filter((t) => tags.includes(t))
}

/** 解析上下文长度标签（如 "200K" / "32.8K"）为千 token 数；非此类返回 0。 */
function contextK(tags: string[]): number {
  for (const t of tags) {
    const m = /^([\d.]+)k$/i.exec(t.trim())
    if (m) return Number(m[1])
  }
  return 0
}

/**
 * 能力评分（越高越强）：有 pricing 真实标签时用「推理标签 + 价格倍率 + 上下文长度」确定性打分；
 * 无标签（pricing 不可达）回退到按名称的 modelReasoningScore。价格越高通常能力越强（成本代理）。
 */
export function modelCapabilityScore(m: ModelInfo): number {
  const tags = m.tags ?? []
  if (tags.length === 0) return modelReasoningScore(m.id)
  let s = 0
  if (tags.includes('推理')) s += 10
  if (tags.includes('多模态')) s += 0.5
  if (tags.includes('工具')) s += 0.5
  s += (m.priceRatio ?? 0) * 4
  s += contextK(tags) / 200
  return s
}

/** 按能力降序排序（同分按 id 字典序），返回新数组。 */
export function sortByReasoning(models: ModelInfo[]): ModelInfo[] {
  return models
    .slice()
    .sort((a, b) => modelCapabilityScore(b) - modelCapabilityScore(a) || a.id.localeCompare(b.id))
}

/** 把模型清单按平台分组并排序（组按 ORDER，组内按 id 字典序）。空清单返回空数组。 */
export function groupModels(models: ModelInfo[]): ModelGroup[] {
  return groupByPlatform(models, (m) => m.id).map((g) => ({
    key: g.key,
    label: g.label,
    models: g.items.slice().sort((a, b) => a.id.localeCompare(b.id)),
  }))
}

/** 通用：把任意条目按其 id 推断的平台分组并按 ORDER 排序（组内保持入参顺序）。 */
export function groupByPlatform<T>(items: T[], idOf: (t: T) => string): { key: string; label: string; items: T[] }[] {
  const map = new Map<string, T[]>()
  for (const it of items) {
    const k = modelPlatform(idOf(it)).key
    const arr = map.get(k)
    if (arr) arr.push(it)
    else map.set(k, [it])
  }
  return ORDER.filter((k) => map.has(k)).map((k) => ({ key: k, label: LABELS[k] ?? k, items: map.get(k)! }))
}
