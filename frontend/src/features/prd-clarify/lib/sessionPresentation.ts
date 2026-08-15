import type { PrdBusinessFields } from '../types'

export interface BusinessFieldEntry {
  label: string
  value: string
  wide: boolean
}

const BUSINESS_FIELD_DEFINITIONS: Array<{
  label: string
  key: keyof PrdBusinessFields
  wide: boolean
}> = [
  { label: '需求类型', key: 'businessRequirementType', wide: false },
  { label: '需求软件', key: 'requirementSoftware', wide: false },
  { label: '发起部门', key: 'initiatingDepartment', wide: false },
  { label: '提出人', key: 'requester', wide: false },
  { label: '提出日期', key: 'requestedAt', wide: false },
  { label: '需求背景 / 业务痛点', key: 'businessBackground', wide: true },
  { label: '需求详情', key: 'requirementDetail', wide: true },
  { label: '附件', key: 'attachments', wide: true },
  { label: '跟进记录', key: 'followUpRecords', wide: true },
]

export function getBusinessFieldEntries(
  fields: PrdBusinessFields | null | undefined,
): BusinessFieldEntry[] {
  if (!fields) return []

  return BUSINESS_FIELD_DEFINITIONS.flatMap(({ label, key, wide }) => {
    const value = fields[key]
    return typeof value === 'string' && value.trim()
      ? [{ label, value: value.trim(), wide }]
      : []
  })
}
