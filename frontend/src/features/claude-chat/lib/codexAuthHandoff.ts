import type { ChatItem } from '../types'

const MAX_HANDOFF_CHARS = 32_000

function conversationLine(item: ChatItem): string | null {
  if (item.kind === 'user') return `用户：${item.text.trim()}`
  if (item.kind === 'assistant') return `助手：${item.text.trim()}`
  return null
}

/** Builds an explicit, bounded context handoff for a new Codex thread in another Auth directory. */
export function buildCodexAuthHandoff(items: ChatItem[], sourceHome: string | null | undefined, targetHome: string): string {
  const lines = items.map(conversationLine).filter((line): line is string => Boolean(line && line.length > 3))
  const selected: string[] = []
  let size = 0
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]
    if (selected.length > 0 && size + line.length + 2 > MAX_HANDOFF_CHARS) break
    selected.unshift(line)
    size += line.length + 2
  }
  const source = sourceHome?.trim() || '%USERPROFILE%\\.codex'
  return [
    '这是 Forge 在切换 Codex Auth 目录时生成的显式上下文交接。',
    `来源 Auth：${source}`,
    `目标 Auth：${targetHome}`,
    '工作目录和项目文件保持不变。下面内容是旧会话中当前已加载的用户/助手对话，不代表你能访问旧 thread 的隐藏状态。请把它作为后续工作的背景；先确认当前任务状态，再继续用户接下来的请求。模型、插件、MCP 和账号权限以目标 Auth 重新加载的结果为准。',
    '',
    '<conversation-handoff>',
    selected.length ? selected.join('\n\n') : '旧会话当前没有可迁移的用户/助手对话。',
    '</conversation-handoff>',
  ].join('\n')
}
