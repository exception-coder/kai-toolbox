export const CODEX_COMPUTER_USE_RECOVERY_STEER = [
  '【浏览器动态节点恢复】使用 cua_repl 操作会实时刷新的页面时，可访问性节点编号只对最近一次页面快照有效。',
  '每次点击、输入、滚动或页面导航后，必须重新读取 getAXState，再从新快照定位下一目标；不得复用动作前的节点编号。',
  '若工具返回 Node is detached from document、节点不存在或执行上下文已销毁，立即重新读取页面状态并按目标语义重新定位，只重试该动作一次；禁止原样重复旧节点调用。',
  '只有 cua_repl 运行时本身不可用时才使用 js_reset；动态节点失效不需要重置运行时。',
].join('\n')

const DETACHED_NODE_PATTERN = /node is detached from document|node (?:does not exist|not found)|execution context (?:was )?destroyed/i

/** 给已明确返回的动态节点失败生成可恢复标题；未知失败仍保留通用标题。 */
export function computerUseFailureTitle(toolName: string, output: unknown): string | undefined {
  if (!/^cua_repl(?:\/|$)/i.test(toolName)) return undefined
  const text = typeof output === 'string' ? output : JSON.stringify(output ?? '')
  if (!DETACHED_NODE_PATTERN.test(text)) return undefined
  return `${toolName} · 页面节点已刷新，需重新定位后重试`
}
