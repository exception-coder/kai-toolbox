import type { ModelInfo } from '../types'
import { modelCapabilityScore } from './modelGroups'

// effort 档位（从弱到强）。4sapi 把 effort 烤进模型名（gpt-5.5-high/medium/low/xhigh），
// 故按 id 后缀识别，折叠成「家族 + 档位」呈现。'default' 表示无后缀的裸模型（走模型默认 effort）。
export const EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type Effort = (typeof EFFORTS)[number] | 'default'

const EFFORT_LABEL: Record<string, string> = {
  minimal: '极简',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '极高',
  default: '默认',
}

export function effortLabel(e: string): string {
  return EFFORT_LABEL[e] ?? e
}

// 匹配作为「-分隔整段」的 effort token，可出现在中间或结尾（如 gpt-5.4-high-openai-compact）。
const EFFORT_RE = new RegExp(`-(${EFFORTS.join('|')})(?=-|$)`, 'i')

/** 提取 id 的 effort 档位；无则 'default'。 */
export function effortOf(id: string): Effort {
  const m = EFFORT_RE.exec(id.toLowerCase())
  return (m ? (m[1].toLowerCase() as Effort) : 'default')
}

/** 家族 key = 去掉 effort token 后的 id（mini/nano/pro 等非 effort 后缀保留，作不同家族）。 */
export function familyKey(id: string): string {
  return id.replace(EFFORT_RE, '')
}

export interface ModelFamily {
  key: string
  label: string
  /** 代表模型（最高档），用于配色/标签/平台与排序。 */
  rep: ModelInfo
  /** 按 effort 从弱到强排序的成员。 */
  members: { effort: Effort; model: ModelInfo }[]
  /** 是否需要 effort 档位切换（成员>1 或唯一成员带非 default 档位）。 */
  hasEffort: boolean
}

const orderOf = (e: Effort) => (e === 'default' ? -1 : EFFORTS.indexOf(e as (typeof EFFORTS)[number]))

/** 把模型清单按家族折叠（保持入参顺序的稳定性，由调用方再排序/分组）。 */
export function buildFamilies(models: ModelInfo[]): ModelFamily[] {
  const map = new Map<string, ModelInfo[]>()
  for (const m of models) {
    const k = familyKey(m.id)
    const arr = map.get(k)
    if (arr) arr.push(m)
    else map.set(k, [m])
  }
  const families: ModelFamily[] = []
  for (const [key, arr] of map) {
    const members = arr
      .map((model) => ({ effort: effortOf(model.id), model }))
      .sort((a, b) => orderOf(a.effort) - orderOf(b.effort))
    const rep = members[members.length - 1].model
    const defaultMember = members.find((x) => x.effort === 'default')
    const label = defaultMember?.model.label ?? key
    const hasEffort = members.length > 1 || members[0].effort !== 'default'
    families.push({ key, label, rep, members, hasEffort })
  }
  return families
}

/** 家族能力分 = 成员中的最高能力分（用于「按能力」排序）。 */
export function familyScore(f: ModelFamily): number {
  return Math.max(...f.members.map((x) => modelCapabilityScore(x.model)))
}
