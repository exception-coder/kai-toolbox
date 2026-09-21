import type { ChatItem } from '../types'

const MAX_HANDOFF_CHARS = 32_000
const MAX_SUMMARY_CHARS = 4_000

export interface CodexAuthHandoffInput {
  items: ChatItem[]
  sourceHome?: string | null
  targetHome: string
  cwd?: string | null
}

function visibleConversation(items: ChatItem[]): Array<{ role: 'user' | 'assistant'; text: string }> {
  return items.flatMap(item => {
    if (item.kind !== 'user' && item.kind !== 'assistant') return []
    const text = item.text.trim()
    return text ? [{ role: item.kind, text }] : []
  })
}

function tailWithinLimit(lines: string[], limit: number): string[] {
  const selected: string[] = []
  let size = 0
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (selected.length > 0 && size + line.length + 2 > limit) break
    selected.unshift(line)
    size += line.length + 2
  }
  return selected
}

function referencedSpecPaths(messages: Array<{ text: string }>): string[] {
  const paths = new Set<string>()
  const pattern = /(?:^|[\s`'"(])((?:\.\.?[\\/])?(?:openspec|docs)[\\/][\w./\\-]+\.(?:md|ya?ml|json))/gi
  for (const message of messages) {
    for (const match of message.text.matchAll(pattern)) paths.add(match[1].replaceAll('\\', '/'))
  }
  return [...paths].slice(0, 12)
}

/** Builds the versioned, source-attributed package used to continue work in another Codex Auth. */
export function buildCodexAuthHandoff(input: CodexAuthHandoffInput): string {
  const messages = visibleConversation(input.items)
  const transcript = tailWithinLimit(
    messages.map(message => `${message.role === 'user' ? '用户' : '助手'}：${message.text}`),
    MAX_HANDOFF_CHARS,
  )
  const latestUser = [...messages].reverse().find(message => message.role === 'user')?.text
  const latestAssistant = [...messages].reverse().find(message => message.role === 'assistant')?.text
  const specPaths = referencedSpecPaths(messages)
  const source = input.sourceHome?.trim() || '%USERPROFILE%\\.codex'
  const cwd = input.cwd?.trim() || '未记录（从目标会话工作目录读取）'
  const handoff = {
    schema: 'forge.codex-auth-handoff/v1',
    intent: 'CONTINUE_EXISTING_WORK',
    source: {
      authDirectory: source,
      contextScope: 'LOADED_VISIBLE_CONVERSATION',
      hiddenModelStateTransferred: false,
      toolStateTransferred: false,
    },
    target: {
      authDirectory: input.targetHome,
      workspaceDirectory: cwd,
      capabilityPolicy: 'RELOAD_FROM_TARGET_AUTH',
    },
    work: {
      objective: latestUser?.slice(0, MAX_SUMMARY_CHARS) || null,
      lastReportedState: latestAssistant?.slice(0, MAX_SUMMARY_CHARS) || null,
      nextAction: latestUser ? '先按证据恢复任务状态，再继续当前用户目标。' : '请用户说明下一步目标。',
    },
    specification: {
      authority: 'OPEN_SPEC_FIRST',
      referencedPaths: specPaths,
      completeness: specPaths.length ? 'PARTIAL_UNVERIFIED' : 'UNKNOWN',
      recoveryOrder: [
        'AGENTS.md 与仓库指令',
        'docs/INDEX.md 与 AI 编程架构',
        'openspec/changes 中匹配当前任务的 proposal/design/tasks/specs',
        'openspec/specs 基线',
        '.forge/domains/snapshot.json 与 graphify-out（仅作代码事实）',
        '当前源码、Git 状态与运行/测试证据',
      ],
      gaps: [
        '交接时未在浏览器侧核验规格是否完整、新鲜或已落地。',
        '目标会话必须读取工作区并标注 missing / partial / stale / conflict；不得用会话摘要覆盖规格或源码事实。',
      ],
    },
    continuity: {
      preserved: ['工作目录', 'Forge 会话运行配置', '以下有界可见对话'],
      reloaded: ['模型目录', 'Skills', 'Plugins', 'MCP', '账号权限'],
      requiredChecks: ['核对当前分支与 Git 工作树', '核对规格任务进度', '核对已执行的验证，不把未运行项记为通过'],
    },
  }
  return [
    '这是 Forge 在切换 Codex Auth 目录时生成的结构化交接包。它是显式证据，不是原生 thread 或隐藏推理的复制。',
    '',
    '<auth-handoff-package>',
    JSON.stringify(handoff, null, 2),
    '</auth-handoff-package>',
    '',
    '<bounded-visible-conversation>',
    transcript.length ? transcript.join('\n\n') : '旧会话当前没有可交接的用户/助手对话。',
    '</bounded-visible-conversation>',
  ].join('\n')
}
