import type { ClaudeChatSessionView } from '../types'

export function SessionImportBadge({ session }: { session: ClaudeChatSessionView }) {
  if (session.importSource !== 'codex') return null
  return <span
    className="shrink-0 text-[10px] font-medium text-[var(--color-muted-foreground)]"
    title="通过 Codex 同步创建，保留原生会话；该目录可包含桌面、CLI 和 VS Code 记录"
  >Codex 导入</span>
}
