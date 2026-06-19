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

/** 把模型清单按平台分组并排序（组按 ORDER，组内按 id 字典序）。空清单返回空数组。 */
export function groupModels(models: ModelInfo[]): ModelGroup[] {
  const map = new Map<string, ModelInfo[]>()
  for (const m of models) {
    const k = modelPlatform(m.id).key
    const arr = map.get(k)
    if (arr) arr.push(m)
    else map.set(k, [m])
  }
  return ORDER.filter((k) => map.has(k)).map((k) => ({
    key: k,
    label: LABELS[k] ?? k,
    models: map.get(k)!.slice().sort((a, b) => a.id.localeCompare(b.id)),
  }))
}
