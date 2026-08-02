import type { PrdReqType, PrdSessionView } from '@/features/prd-clarify/types'
import type { ReqItemView } from './types'

export interface FactQualityCriterion {
  key: 'location' | 'problem' | 'scenario' | 'acceptance' | 'boundary' | 'evidence'
  label: string
  weight: number
  earned: number
  reason: string
}

export interface FactQualityResult {
  score: number
  grade: 'A' | 'B' | 'C' | 'D'
  level: 'READY' | 'REVIEW' | 'CLARIFY' | 'BLOCKED'
  levelLabel: string
  reqType: PrdReqType
  reqTypeLabel: string
  inferredType: boolean
  locationLabel: string
  criteria: FactQualityCriterion[]
  deductions: Array<{ label: string; points: number; reason: string }>
}

const URL_PATTERN = /(?:https?:\/\/[^\s)\]}]+|(?:^|\s)\/[a-zA-Z0-9][^\s)\]}]*)/im

function containsAny(text: string, patterns: RegExp[]) {
  return patterns.some(pattern => pattern.test(text))
}

function inferReqType(item: ReqItemView): PrdReqType {
  const text = `${item.title}\n${item.description ?? ''}\n${item.tags ?? ''}`
  if (containsAny(text, [/\bbug\b/i, /缺陷|故障|报错|异常|失败|不生效|无法|修复|闪退|错误码/])) return 'BUG_FIX'
  if (containsAny(text, [/优化|调整|改造|改版|现有|已有|修改|兼容|迁移|重构|补充字段|增加字段/])) return 'MODULE_ADJUST'
  return 'NEW_MODULE'
}

function factCorpus(item: ReqItemView, session?: PrdSessionView) {
  const fields = session?.businessFields
  const values = [
    item.title,
    item.description,
    session?.rawInput,
    fields?.requirementDetail,
    fields?.businessBackground,
    fields?.businessRequirementType,
    fields?.requirementSoftware,
    fields?.initiatingDepartment,
    fields?.requester,
    fields?.attachments,
    fields?.followUpRecords,
    ...(session?.questions.map(question => question.answer) ?? []),
  ].filter((value): value is string => !!value?.trim()).map(value => value.trim())
  return [...new Set(values)].join('\n')
}

function criterion(
  key: FactQualityCriterion['key'],
  label: string,
  weight: number,
  earned: number,
  reason: string,
): FactQualityCriterion {
  return { key, label, weight, earned: Math.max(0, Math.min(weight, earned)), reason }
}

/**
 * 需求事实质量评分：采用固定规则，保证同一份事实始终得到同一分数和可追溯扣分。
 * 评分关注“开发是否拿到了足以定位、理解和验收的事实”，不把 PRD/TDD 是否已生成当成事实质量。
 */
export function evaluateRequirementFacts(item: ReqItemView, session?: PrdSessionView): FactQualityResult {
  const reqType = session?.reqType ?? inferReqType(item)
  const inferredType = !session?.reqType
  const reqTypeLabel = reqType === 'BUG_FIX' ? 'BUG 修复' : reqType === 'MODULE_ADJUST' ? '现有模块优化' : '新增能力/模块'
  const text = factCorpus(item, session)
  const compact = text.replace(/\s+/g, ' ').trim()
  const hasUrl = URL_PATTERN.test(text)
  const system = item.project?.trim() || session?.project?.trim() || ''
  const module = item.module?.trim() || session?.module?.trim() || ''
  const existingChange = reqType === 'BUG_FIX' || reqType === 'MODULE_ADJUST'

  let locationEarned = 0
  const locationNotes: string[] = []
  if (system) {
    locationEarned += 10
    locationNotes.push(`系统已定位：${system}`)
  } else if (hasUrl) {
    locationEarned += 7
    locationNotes.push('已提供 URL，可反查所属系统；建议仍补登记系统')
  } else if (reqType === 'NEW_MODULE') {
    locationEarned += 5
    locationNotes.push('新增能力允许系统待创建，但应给出拟归属域')
  } else {
    locationNotes.push('未登记关联系统')
  }
  if (module) {
    locationEarned += 15
    locationNotes.push(`模块已定位：${module}`)
  } else if (hasUrl) {
    locationEarned += 15
    locationNotes.push('模块未知，但 URL 已达到页面级定位要求')
  } else if (!existingChange) {
    locationEarned += 15
    locationNotes.push('新增模块尚不存在，模块定位项豁免')
  } else {
    locationNotes.push('BUG/现有模块优化缺少模块或 URL 定位')
  }

  const descriptionLength = compact.length
  const descriptionEarned = descriptionLength >= 100 ? 10 : descriptionLength >= 40 ? 7 : descriptionLength > 0 ? 3 : 0
  const hasCurrent = containsAny(text, [/现状|目前|现在|实际|原来|当前行为|存在问题|问题是|报错|异常|无法|不支持|失败/])
  const hasExpected = containsAny(text, [/期望|预期|目标|需要|希望|应当|应该|改为|支持|优化为|修复后|最终/])
  let statementEarned = descriptionEarned
  if (existingChange) {
    if (hasCurrent) statementEarned += 7
    if (hasExpected) statementEarned += 8
  } else {
    statementEarned += hasExpected ? 15 : hasCurrent ? 6 : 0
  }
  const statementNotes = [
    descriptionLength === 0 ? '缺少问题/需求描述' : descriptionLength < 40 ? '描述过短，开发难以还原上下文' : '已有可阅读的问题描述',
    existingChange
      ? hasCurrent && hasExpected ? '现状与期望均已说明' : !hasCurrent && !hasExpected ? '未区分当前行为与期望行为' : hasCurrent ? '缺少明确期望结果' : '缺少当前/实际行为'
      : hasExpected ? '目标状态已说明' : '新增能力缺少明确目标状态',
  ]

  const hasScenario = containsAny(text, [/用户|角色|人员|客户|供应商|员工|部门|场景|流程|操作人|谁|当.+时|在.+情况下/])
  const hasImpact = containsAny(text, [/影响|导致|造成|风险|损失|效率|收益|价值|成本|投诉|阻塞|耗时|频率|范围|多少|比例|金额/])
  const scenarioEarned = (hasScenario ? 7 : 0) + (hasImpact ? 8 : 0)

  const hasAcceptanceKeyword = containsAny(text, [/验收|完成标准|成功标准|判定标准|必须|确保|校验|可验证|期望结果|返回.+码|显示|不再|能够|可以/])
  const structuredFacts = text.split('\n').filter(line => /^\s*(?:[-*•]|\d+[.、)])\s*/.test(line)).length
  const hasMeasurableValue = containsAny(text, [/\d+(?:\.\d+)?\s*(?:秒|分钟|小时|天|%|％|条|次|个|人|元|MB|GB|ms|s\b)/i])
  const acceptanceEarned = Math.min(15, (hasAcceptanceKeyword ? 8 : 0) + (structuredFacts >= 2 ? 4 : 0) + (hasMeasurableValue ? 3 : 0))

  const hasBoundary = containsAny(text, [/范围|边界|不包含|不支持|仅限|只允许|不影响|兼容|权限|约束|依赖|前置|例外|异常处理|回滚|安全|性能/])
  const hasDataOrInterface = containsAny(text, [/接口|API|字段|数据|状态|枚举|数据库|表|参数|输入|输出|权限/])
  const boundaryEarned = Math.min(10, (hasBoundary ? 6 : 0) + (hasDataOrInterface ? 4 : 0))

  const hasAttachment = containsAny(text, [/附件|截图|图片|日志|堆栈|录屏|示例|样例|复现|步骤|错误码|trace|\.png|\.jpg|\.pdf|\.docx/i])
  const evidenceEarned = Math.min(10, (hasUrl ? 5 : 0) + (hasAttachment ? 5 : 0))

  const criteria = [
    criterion('location', '系统与模块定位', 25, locationEarned, locationNotes.join('；')),
    criterion('problem', '问题与目标陈述', 25, statementEarned, statementNotes.join('；')),
    criterion('scenario', '使用场景与业务影响', 15, scenarioEarned, hasScenario && hasImpact ? '使用者/场景与影响均已说明' : !hasScenario && !hasImpact ? '缺少使用者/场景和业务影响' : hasScenario ? '已有使用场景，缺少业务影响' : '已有影响描述，缺少使用者或触发场景'),
    criterion('acceptance', '可验证验收口径', 15, acceptanceEarned, acceptanceEarned >= 12 ? '验收条件较完整且可验证' : acceptanceEarned > 0 ? '已有部分结果描述，但缺少完整验收条件或量化标准' : '未提供可验证的验收标准'),
    criterion('boundary', '范围、约束与依赖', 10, boundaryEarned, boundaryEarned >= 8 ? '边界及数据/接口约束较明确' : boundaryEarned > 0 ? '仅说明了部分边界或技术约束' : '未说明范围边界、兼容性、权限或依赖'),
    criterion('evidence', '定位与佐证材料', 10, evidenceEarned, evidenceEarned === 10 ? '同时提供了 URL 与截图/日志/复现材料' : hasUrl ? '已提供 URL，缺少截图、日志或复现材料' : hasAttachment ? '已有附件/复现材料，缺少页面 URL' : '未提供 URL、截图、日志、示例或复现材料'),
  ]
  const score = criteria.reduce((sum, item) => sum + item.earned, 0)
  const deductions = criteria
    .filter(item => item.earned < item.weight)
    .map(item => ({ label: item.label, points: item.weight - item.earned, reason: item.reason }))
    .sort((a, b) => b.points - a.points)

  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D'
  const level = score >= 90 ? 'READY' : score >= 75 ? 'REVIEW' : score >= 60 ? 'CLARIFY' : 'BLOCKED'
  const levelLabel = level === 'READY' ? '事实充分' : level === 'REVIEW' ? '可评审' : level === 'CLARIFY' ? '需补充' : '不建议准入'
  const locationLabel = module ? `${system || '未登记系统'} / ${module}` : hasUrl ? `${system || 'URL 反查系统'} / URL 已定位` : `${system || '待归属'} / ${existingChange ? '缺少模块或 URL' : '模块待创建'}`

  return { score, grade, level, levelLabel, reqType, reqTypeLabel, inferredType, locationLabel, criteria, deductions }
}
