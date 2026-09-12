import type { FeishuRequirementRecord } from '../api'
import type { PrdBusinessFields } from '@/features/prd-clarify/public-api'

export function mapFeishuBusinessFields(record: FeishuRequirementRecord): PrdBusinessFields {
  return {
    requirementDetail: findField(record, '需求详情', 'fld4MyICot'),
    businessBackground: findField(record, '需求背景/业务痛点', '需求背景', '业务痛点', 'fld57ObEhK'),
    businessRequirementType: normalizeBusinessRequirementType(
      findField(record, '需求类型', 'fld2JgJuVL'),
    ),
    requirementSoftware: findField(record, '需求软件', 'fld43K1LNl'),
    initiatingDepartment: findField(record, '发起部门', 'fld6iE5Iix'),
    requester: findField(record, '提出人', 'fldeHXs8Cx'),
    requestedAt: normalizeRequestedAt(findField(record, '提出日期', 'fld1K9bTud')),
    attachments: findField(record, '附件', 'fld79KCQet'),
    followUpRecords: findField(record, '跟进记录', '处理反馈', 'fldwa51TeQ'),
  }
}

function findField(record: FeishuRequirementRecord, ...names: string[]) {
  for (const name of names) {
    const value = record.fields[name]
    if (value?.trim()) return value.trim()
  }
  return ''
}

function normalizeBusinessRequirementType(value: string) {
  const labels: Record<string, string> = {
    optki0Xnkb: '功能优化',
    optQ9FhwmC: '新需求',
    optaw9hHim: '数据异常',
    optph80OtF: '系统缺陷',
  }
  return labels[value] ?? value
}

function normalizeRequestedAt(value: string) {
  if (!/^\d{12,}$/.test(value)) return value
  const timestamp = Number(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : value
}
