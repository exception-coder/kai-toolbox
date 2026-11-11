import { useEffect, useState, type RefObject } from 'react'
import type { MessageListHandle } from '../components/MessageList'
import type { UseClaudeChatSocket } from './useClaudeChatSocket'
import type { ChatItem } from '../types'

type UserItem = Extract<ChatItem, { kind: 'user' }>
type HistoryChat = Pick<UseClaudeChatSocket, 'items' | 'historyLoading' | 'historyError' | 'historyExhausted' | 'loadHistory'>

/**
 * 消息跳转：定位到某条提问（不在已加载范围时持续加载更早历史）与“跳到会话开头”。
 * 从 ChatPage 拆出，行为与原实现一致。
 */
export function useMessageJump(chat: HistoryChat | null | undefined, messageListRef: RefObject<MessageListHandle | null>) {
  // 「我的提问」面板点中一条待滚到的目标：可能还没加载进 chat.items（分页更早历史里）。
  const [pendingScroll, setPendingScroll] = useState<UserItem | null>(null)
  // 目标不在当前已加载消息里时，持续触发「加载更早」直到出现或加载到头——否则用户点了没反应，
  // 只能靠自己反复上拉去找，这正是「点击不在渲染中的提问不会自动滚动定位」的根因。
  // 优先按 id 精确匹配；分页重新拉取更早历史后合成 id（按下标生成）可能整体漂移，
  // 找不到时按 ts+文本兜底匹配同一条消息。
  useEffect(() => {
    if (!pendingScroll || !chat) return
    const exact = chat.items.find(it => it.id === pendingScroll.id)
    const fallback = !exact && chat.items.find(
      (it): it is UserItem =>
        it.kind === 'user' && it.ts === pendingScroll.ts && (it.displayText ?? it.text) === (pendingScroll.displayText ?? pendingScroll.text),
    )
    const target = exact ?? fallback
    if (target) {
      messageListRef.current?.scrollToItem(target.id)
      setPendingScroll(null)
      return
    }
    if (chat.historyLoading || chat.historyError) return // 失败时等待用户显式重试，避免循环拉取旧历史
    if (chat.historyExhausted) { setPendingScroll(null); return } // 加载到最早了还没找到，放弃
    chat.loadHistory(false)
  }, [pendingScroll, chat?.items, chat?.historyLoading, chat?.historyError, chat?.historyExhausted, chat?.loadHistory])
  // 「跳到会话开头」：持续触发「加载更早」直到分页到头（exhausted），再滚到已加载的第 0 条——
  // 这样不管会话有多长、翻了多少页，一键都能直接回到最初的第一条消息，不用自己一页页往上翻。
  const [jumpingToStart, setJumpingToStart] = useState(false)
  useEffect(() => {
    if (!jumpingToStart || !chat) return
    if (chat.historyLoading || chat.historyError) return
    if (chat.historyExhausted) {
      messageListRef.current?.scrollToStart()
      setJumpingToStart(false)
      return
    }
    chat.loadHistory(false)
  }, [jumpingToStart, chat?.items, chat?.historyLoading, chat?.historyError, chat?.historyExhausted, chat?.loadHistory])
  return { setPendingScroll, setJumpingToStart }
}
