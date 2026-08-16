import type { ChatItem } from '@/features/claude-chat/public-api'

export type AuditState = 'running' | 'pass' | 'idle' | 'warn'

export interface AuditEvidence {
  toolName: string
  input: string
  output: string
  isError: boolean
}

export interface ConsultTurnAudit {
  assistantId: string
  domain: { state: AuditState; evidence: AuditEvidence[] }
  graphify: { state: AuditState; evidence: AuditEvidence[] }
  bug: { state: AuditState; label: string }
  database: { state: AuditState; label: string; evidence: AuditEvidence[] }
}

const BUG_BLOCK_RE = /<<<BUG_REPORT>>>\s*([\s\S]*?)\s*<<<END_BUG_REPORT>>>/
const DOMAIN_TOOL_RE = /(?:^|__|[-_/])(domain-knowledge|cross-topology)(?:__|[-_/]|$)/i
const GRAPHIFY_TOOL_RE = /(?:^|__|[-_/])graphify(?:__|[-_/]|$)/i
const DATABASE_TOOL_RE = /(?:^|__|[-_/])(?:erp|srm)_db(?:__|[-_/]|$)/i
const SHELL_TOOL_RE = /(?:^|__)(bash|shell|powershell|exec|shell_command)(?:__|$)/i
const GRAPHIFY_COMMAND_RE = /(?:^|[\s;&|])graphify(?:\.exe)?\s+query\b/i
const TEST_ENV_RE = /(?:来自|来源于|取自|就是|属于|在)\s*(?:测试|test|uat)\s*(?:环境|库|系统)?|测试环境(?:的|里|中)?(?:截图|数据|单据|记录)/i
const RECORD_CLUE_RE = /截图|单据号|订单号|流水号|申请单|审批单|款号|编号|记录|这条数据|这张图/i

function compact(value: unknown, max = 240): string {
  let text: string
  if (typeof value === 'string') text = value
  else {
    try {
      text = JSON.stringify(value)
    } catch {
      text = String(value ?? '')
    }
  }
  const normalized = text.replace(/\s+/g, ' ').trim()
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized
}

function commandFrom(input: unknown): string {
  if (typeof input === 'string') return input
  if (!input || typeof input !== 'object') return ''
  const record = input as Record<string, unknown>
  return compact(record.command ?? record.cmd ?? record.script ?? record.input ?? input, 800)
}

function evidenceOf(item: Extract<ChatItem, { kind: 'tool' }>): AuditEvidence {
  return {
    toolName: item.toolName || '未知工具',
    input: compact(item.input),
    output: compact(item.output ?? ''),
    isError: !!item.isError,
  }
}

function hasValidBugBlock(answer: string): 'valid' | 'invalid' | 'none' {
  const match = answer.match(BUG_BLOCK_RE)
  if (!match) return 'none'
  try {
    const parsed = JSON.parse(match[1].trim()) as { title?: unknown }
    return typeof parsed.title === 'string' && parsed.title.trim() ? 'valid' : 'invalid'
  } catch {
    return 'invalid'
  }
}

export function buildConsultTurnAudits(items: ChatItem[], running: boolean): Map<string, ConsultTurnAudit> {
  const audits = new Map<string, ConsultTurnAudit>()
  let question = ''
  let tools: Extract<ChatItem, { kind: 'tool' }>[] = []

  for (let index = 0; index < items.length; index++) {
    const item = items[index]
    if (item.kind === 'user') {
      question = item.displayText ?? item.text
      tools = []
      continue
    }
    if (item.kind === 'tool') {
      tools.push(item)
      continue
    }
    if (item.kind !== 'assistant' || !item.text.trim()) continue

    const isLastUnfinished = running && !items.slice(index + 1).some((next) => next.kind === 'user')
    const domainEvidence = tools.filter((tool) => DOMAIN_TOOL_RE.test(tool.toolName)).map(evidenceOf)
    const graphifyEvidence = tools
      .filter((tool) => GRAPHIFY_TOOL_RE.test(tool.toolName)
        || (SHELL_TOOL_RE.test(tool.toolName) && GRAPHIFY_COMMAND_RE.test(commandFrom(tool.input))))
      .map(evidenceOf)
    const databaseEvidence = tools.filter((tool) => DATABASE_TOOL_RE.test(tool.toolName)).map(evidenceOf)
    const bugBlock = hasValidBugBlock(item.text)
    const testDeclared = TEST_ENV_RE.test(question)
    const recordClue = RECORD_CLUE_RE.test(question)
    const databaseViolation = databaseEvidence.length > 0 && recordClue && !testDeclared

    audits.set(item.id, {
      assistantId: item.id,
      domain: {
        state: isLastUnfinished ? 'running' : domainEvidence.length ? 'pass' : 'idle',
        evidence: domainEvidence,
      },
      graphify: {
        state: isLastUnfinished ? 'running' : graphifyEvidence.length ? 'pass' : 'idle',
        evidence: graphifyEvidence,
      },
      bug: isLastUnfinished
        ? { state: 'running', label: 'BUG 评估中' }
        : bugBlock === 'valid'
          ? { state: 'warn', label: '确认缺陷' }
          : bugBlock === 'invalid'
            ? { state: 'warn', label: 'BUG 标记格式错误' }
            : { state: 'pass', label: '已评估 · 非缺陷' },
      database: {
        state: databaseViolation ? 'warn' : databaseEvidence.length ? 'pass' : 'idle',
        label: databaseViolation
          ? '疑似违反测试库红线'
          : databaseEvidence.length
            ? testDeclared ? '测试库查询 · 已声明来源' : '测试库查询 · 无生产数据线索'
            : '未查询测试库',
        evidence: databaseEvidence,
      },
    })
  }

  return audits
}
