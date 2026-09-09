import type { Rule } from './types'

export interface RuleGroup {
  rule: Omit<Rule, 'category'> & { category: string }
  kind: string
  sources: Rule[]
}
