import type { CollaborationContext } from '../contracts'
export type { RequirementDraft } from '../contracts'
import { requirementDraftInstructions } from '../../../assistant-sdk/requirementDraft'
export { requirementKinds, requirementDraftSchema, extractRequirement } from '../../../assistant-sdk/requirementDraft'
export type { RequirementKind } from '../../../assistant-sdk/requirementDraft'
import type { RequirementKind } from '../../../assistant-sdk/requirementDraft'

export function requirementPrompt(kind: RequirementKind, message: string, context: CollaborationContext): string {
  return `【业务需求整理】类型：${kind}；系统：${context.systemName}；模块：${context.moduleName}。
用户描述：
${message}

请围绕用户描述澄清需求。先核对绑定项目的模块代码、OpenSpec、数据库结构和已授权的数据；没有访问权限或未核验的内容必须列为待确认，不得臆造依据。区分当前行为、目标、边界、验收标准。只分析和整理，本轮不执行开发、SQL 写入、提交或部署；涉及权限以服务端授权为准。必要时先追问关键问题。
${requirementDraftInstructions}`
}

export function businessMessage(text: string): string {
  if (!text.startsWith('【业务需求整理】')) return text
  return text.split('用户描述：\n')[1]?.split('\n\n请围绕用户描述澄清需求。')[0] ?? text
}
