import { z } from 'zod'

export const requirementKinds = ['需求', 'BUG', '优化'] as const
export type RequirementKind = typeof requirementKinds[number]
const text = z.string().trim().max(6000)
export const requirementDraftSchema = z.object({
  title: text.min(1), kind: z.enum(requirementKinds), summary: text.min(1),
  current: text, expected: text.min(1), scope: text,
  acceptance: z.array(text.min(1)).min(1).max(30),
  evidence: z.array(text).max(30), questions: z.array(text).max(30),
})

export function extractRequirement(text: string): z.infer<typeof requirementDraftSchema> | undefined {
  const blocks = [...text.matchAll(/```requirement-json\s*\n([\s\S]*?)```/g)]
  for (const block of blocks.reverse()) {
    try { const result = requirementDraftSchema.safeParse(JSON.parse(block[1])); if (result.success) return result.data }
    catch { /* Incomplete streaming output stays in the conversation. */ }
  }
}


export const requirementDraftInstructions = '信息充分后，在反馈草稿内输出一个 requirement-json 代码块，字段为 title、kind（需求/BUG/优化）、summary（一句清晰明确的需求表述，仅概括用户确认的功能与结果）、current、expected、scope、acceptance（字符串数组）、evidence（实际核验依据字符串数组）、questions（待确认项字符串数组）。所有字段必填；未确认的信息不得补造，仍有关键歧义时先追问，questions 不得伪装为空；普通问答不输出此代码块。'
