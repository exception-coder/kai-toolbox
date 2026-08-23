import type { ChatItem } from '../types'

const MAX_INITIAL_SPEC_LENGTH = 6_000
const MAX_CORE_INDEX_LENGTH = 16_000
const MAX_CONVERSATION_LENGTH = 16_000
const STABLE_INDEX_ID = /\b(?:GOAL|REQ|RULE|SCN|AC|CONSTRAINT|DECISION|OPEN|EVD)-[A-Z0-9._-]+\b/i

export type ReviewContextStatus = 'READY' | 'DEGRADED' | 'BLOCKED'

export interface ReviewContextBaseline {
  systemName: string
  projectName: string
  moduleName: string
  moduleKey: string
  moduleSource: 'KNOWLEDGE' | 'AUTO' | 'MANUAL'
  moduleSummary?: string
  modulePaths?: string[]
  prdTitle?: string
  prdUpdatedAt?: number
  initialSpecification: string
  initialSpecificationSource: string
  coreIndex?: string
  coreSpecificationSource?: string
  status: ReviewContextStatus
  warnings: string[]
}

export interface ParsedReviewContextSnapshot {
  sections: Array<{ title: string; content: string }>
  fields: Record<string, string>
  status: ReviewContextStatus
  legacy: boolean
}

function messageText(item: ChatItem): string {
  if (item.kind !== 'user' && item.kind !== 'assistant') return ''
  return (item.kind === 'user' ? item.displayText ?? item.text : item.text).trim()
}

export function initialReviewSpecification(items: ChatItem[], fallback: string): string {
  const requirements = items
    .filter((item): item is Extract<ChatItem, { kind: 'user' }> => item.kind === 'user')
    .map(messageText)
    .filter(Boolean)
    .slice(-8)
  return (requirements.length > 0 ? requirements.map(text => `- ${text}`).join('\n') : fallback.trim())
    .slice(0, MAX_INITIAL_SPEC_LENGTH)
}

export function extractCoreIndex(content: string): string {
  const normalized = content.trim()
  if (!normalized) return ''
  const lines = normalized.split(/\r?\n/)
  const selected = lines.filter(line => /^#{1,4}\s+/.test(line) || STABLE_INDEX_ID.test(line))
  const result = (selected.length > 0 ? selected.join('\n') : [
    '（核心规格中未发现稳定索引 ID，以下为受控摘要）',
    normalized.slice(0, 8_000),
  ].join('\n')).trim()
  return result.slice(0, MAX_CORE_INDEX_LENGTH)
}

export function buildReviewContextSnapshot(input: {
  baseline: ReviewContextBaseline
  items: ChatItem[]
}): string {
  const conversation = input.items
    .filter(item => item.kind === 'user' || item.kind === 'assistant')
    .slice(-24)
    .map(item => `${item.kind === 'user' ? '业务方' : 'AI'}：${messageText(item)}`)
    .filter(line => !line.endsWith('：'))
    .join('\n\n')
    .slice(-MAX_CONVERSATION_LENGTH)
  const baseline = input.baseline
  const warnings = baseline.warnings.length > 0
    ? baseline.warnings.map(warning => `- ${warning}`).join('\n')
    : '- 无'
  return [
    '## 评审对象',
    `系统：${baseline.systemName.trim()}`,
    `项目：${baseline.projectName.trim()}`,
    `模块：${baseline.moduleName.trim()}`,
    `模块索引：${baseline.moduleKey.trim()}`,
    '',
    '## 模块定义',
    `定义来源：${baseline.moduleSource}`,
    `业务摘要：${baseline.moduleSummary?.trim() || '（未配置）'}`,
    `代码边界：${baseline.modulePaths?.filter(Boolean).join('、') || '（未配置）'}`,
    '',
    '## 当前需求初始规格',
    `来源：${baseline.initialSpecificationSource}`,
    baseline.initialSpecification.trim().slice(0, MAX_INITIAL_SPEC_LENGTH),
    '',
    '## 核心索引上下文',
    `来源：${baseline.coreSpecificationSource || '（未关联核心规格）'}`,
    baseline.prdTitle ? `关联规格：${baseline.prdTitle}` : '关联规格：（未关联）',
    baseline.prdUpdatedAt ? `规格更新时间：${new Date(baseline.prdUpdatedAt).toISOString()}` : '规格更新时间：（未知）',
    baseline.coreIndex?.trim() || '（未取得核心索引）',
    '',
    '## 审计边界',
    `完整性状态：${baseline.status}`,
    '回答规则：引用核心索引时必须保留稳定 ID；没有索引依据时标明基于本轮对话或待确认。',
    '证据缺口：',
    warnings,
    '',
    '## 近期需求与方案上下文',
    conversation || '（暂无补充对话）',
  ].join('\n')
}

export function parseReviewContextSnapshot(snapshot: string): ParsedReviewContextSnapshot {
  const sections: Array<{ title: string; content: string }> = []
  let title = ''
  let lines: string[] = []
  const flush = () => {
    if (title) sections.push({ title, content: lines.join('\n').trim() })
  }
  for (const line of snapshot.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.+)$/)
    if (heading) {
      flush()
      title = heading[1].trim()
      lines = []
    } else if (title) {
      lines.push(line)
    }
  }
  flush()
  const fields: Record<string, string> = {}
  for (const section of sections) {
    for (const line of section.content.split('\n')) {
      const field = line.match(/^([^：]{1,20})：(.+)$/)
      if (field) fields[field[1].trim()] = field[2].trim()
    }
  }
  const rawStatus = fields['完整性状态']
  const status: ReviewContextStatus = rawStatus === 'READY' || rawStatus === 'BLOCKED' ? rawStatus : 'DEGRADED'
  return { sections, fields, status, legacy: !sections.some(section => section.title === '模块定义') }
}
