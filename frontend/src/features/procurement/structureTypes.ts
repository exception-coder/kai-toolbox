export interface StructureField {
  key: string
  label: string
  group: string
  type: 'TEXT' | 'DECIMAL' | 'DATE'
  mode: 'SYSTEM' | 'LLM' | 'MANUAL'
  description: string
  enabled: boolean
  order: number
}
export interface StructureSchema { version: number; fields: StructureField[] }
export interface StructuredValue {
  field: StructureField
  value: string
  source: 'SYSTEM' | 'CODE' | 'LLM' | 'MANUAL' | 'CONFLICT' | 'EMPTY'
  evidence: { value: string; raw: string; evidence: string; section: string }[]
  alternatives: string[]
  overridden: boolean
}
export interface StructuredResult {
  schemaVersion: number
  analysisVersion: number
  version: number
  values: StructuredValue[]
  overrides: Record<string, string>
}
export interface StructureCorrection { schemaVersion: number; version: number; values: Record<string, string> }
export const fieldModes = { SYSTEM: '系统填入', LLM: '智能解析', MANUAL: '人工维护' }
export const fieldTypes = { TEXT: '文本', DECIMAL: '数字', DATE: '日期' }
export const valueSources = { SYSTEM: '系统', CODE: '代码提取', LLM: '模型提取', MANUAL: '人工修正', CONFLICT: '多值待核验', EMPTY: '待补充' }
