import type { PrdSessionView } from '@/features/prd-clarify/public-api'
import type { ReqItemView, RequirementType, RequirementTypeSource } from './types'

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
  level: 'READY' | 'ASSUMPTIONS' | 'DECISION'
  levelLabel: string
  maturityLabel: string
  readinessSummary: string
  blockers: string[]
  riskFlags: string[]
  reqType: RequirementType
  reqTypeLabel: string
  reqTypeSource: RequirementTypeSource
  reqTypeSourceLabel: string
  locationLabel: string
  criteria: FactQualityCriterion[]
  deductions: Array<{ label: string; points: number; reason: string }>
}

const URL_PATTERN = /(?:https?:\/\/[^\s)\]}]+|(?:^|\s)\/[a-zA-Z0-9][^\s)\]}]*)/im

function containsAny(text: string, patterns: RegExp[]) {
  return patterns.some(pattern => pattern.test(text))
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
 * 将“能否初始化开发”与“规格成熟度”分开评估。
 * 门禁只阻断会改变实现方向的关键缺口；分数用于描述规格成熟度，不作为单一准入线。
 */
export function evaluateRequirementFacts(item: ReqItemView, session?: PrdSessionView): FactQualityResult {
  const reqType = session?.reqType ?? item.reqType
  const reqTypeSource = session?.reqType ? 'PRD_SESSION' : item.reqTypeSource
  const reqTypeLabel = reqType === 'BUG_FIX' ? 'BUG 修复'
    : reqType === 'MODULE_ADJUST' ? '现有模块优化'
      : reqType === 'NEW_MODULE' ? '新增能力/模块' : '待判定'
  const reqTypeSourceLabel = reqTypeSource === 'AI' ? 'AI 判定'
    : reqTypeSource === 'PRD_SESSION' ? 'PRD 事实'
      : reqTypeSource === 'EXPLICIT' ? '显式选择' : '无可靠来源'
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
  } else if (reqType === 'NEW_MODULE') {
    locationEarned += 15
    locationNotes.push('新增模块尚不存在，模块定位项豁免')
  } else {
    locationNotes.push(reqType === 'UNKNOWN' ? '需求类型待判定，且缺少模块或 URL 定位' : 'BUG/现有模块优化缺少模块或 URL 定位')
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
    criterion('location', '目标系统与实现边界', 20, Math.round(locationEarned * 0.8), locationNotes.join('；')),
    criterion('problem', '意图与预期结果', 20, Math.round(statementEarned * 0.8), statementNotes.join('；')),
    criterion('scenario', '核心场景与业务规则', 20, Math.min(20, (hasScenario ? 12 : 0) + (hasImpact ? 8 : 0)), hasScenario && hasImpact ? '核心场景与业务影响均已说明' : !hasScenario && !hasImpact ? '尚未明确核心场景；业务影响可在排序阶段补充' : hasScenario ? '已有核心场景；业务影响可在排序阶段补充' : '已有业务影响，仍需补充主要使用者或触发场景'),
    criterion('acceptance', '可验证验收示例', 20, Math.min(20, Math.round(acceptanceEarned * 4 / 3)), acceptanceEarned >= 12 ? '验收条件较完整且可验证' : acceptanceEarned > 0 ? '已有可观察结果，可在实施中补齐边界示例' : '缺少可观察的成功结果，无法验证实现是否正确'),
    criterion('boundary', '关键约束、依赖与风险', 15, Math.min(15, Math.round(boundaryEarned * 1.5)), boundaryEarned >= 8 ? '关键边界及数据/接口约束较明确' : boundaryEarned > 0 ? '已说明部分关键约束，其余可作为显式假设继续探索' : '未发现明确边界；将作为实施假设与风险项持续核查'),
    criterion('evidence', '代码定位与补充证据', 5, Math.min(5, Math.round(evidenceEarned / 2)), evidenceEarned === 10 ? '同时提供了 URL 与截图/日志/复现材料' : hasUrl ? '已有 URL；其他材料属于可信度增强项' : hasAttachment ? '已有附件或复现材料；URL 可由代码路由继续反查' : '未提供附件证据；新能力不因此阻断，存量问题需在实施前补足定位'),
  ]
  const score = criteria.reduce((sum, item) => sum + item.earned, 0)
  const deductions = criteria
    .filter(item => item.earned < item.weight)
    .map(item => ({ label: item.label, points: item.weight - item.earned, reason: item.reason }))
    .sort((a, b) => b.points - a.points)

  const grade = score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D'
  const maturityLabel = score >= 80 ? '规格充分' : score >= 60 ? '可开发，仍可增强' : score >= 40 ? '可初始化，需持续收敛' : '关键事实不足'
  const blockers: string[] = []
  if (statementEarned < 10 || !hasExpected) blockers.push('缺少明确意图或预期结果')
  if (existingChange && !module && !hasUrl) blockers.push('存量变更无法定位到模块或页面')
  if (acceptanceEarned === 0) blockers.push('缺少可观察的核心验收结果')
  const hasOpenCriticalDecision = containsAny(text, [/待(?:需求方)?(?:确认|确定|判定).{0,30}(?:接口|字段|数据|权限|状态|业务规则)/])
  if (hasOpenCriticalDecision) blockers.push('关键数据、权限、接口或业务规则仍待需求方判定')

  const riskFlags: string[] = []
  if (!hasScenario) riskFlags.push('核心使用场景待补充')
  if (!hasBoundary) riskFlags.push('范围与约束将按当前探索结果作为显式假设')
  if (reqType === 'BUG_FIX' && !hasAttachment) riskFlags.push('BUG 缺少复现材料，实施前需完成复现')
  if (reqType === 'MODULE_ADJUST' && !hasUrl && !module) riskFlags.push('存量模块缺少代码或页面定位证据')
  if (hasDataOrInterface && !hasBoundary) riskFlags.push('数据或接口变更缺少兼容性约束')

  const level = blockers.length > 0 ? 'DECISION' : riskFlags.length > 0 || score < 80 ? 'ASSUMPTIONS' : 'READY'
  const levelLabel = level === 'READY' ? '可以直接实施' : level === 'ASSUMPTIONS' ? '可初始化开发' : '需要关键判定'
  const readinessSummary = level === 'READY'
    ? '核心意图、范围与验收事实已经足以直接进入实施。'
    : level === 'ASSUMPTIONS'
      ? '允许生成执行计划并初始化开发；未决细节将记录为假设和风险，不通过补充式问答阻断。'
      : `暂缓完整实施：${blockers.join('；')}。`
  const missingLocation = reqType === 'NEW_MODULE' ? '模块待创建'
    : reqType === 'UNKNOWN' ? '类型待判定，缺少模块或 URL' : '缺少模块或 URL'
  const locationLabel = module ? `${system || '未登记系统'} / ${module}` : hasUrl ? `${system || 'URL 反查系统'} / URL 已定位` : `${system || '待归属'} / ${missingLocation}`

  return { score, grade, level, levelLabel, maturityLabel, readinessSummary, blockers, riskFlags, reqType, reqTypeLabel, reqTypeSource, reqTypeSourceLabel, locationLabel, criteria, deductions }
}
