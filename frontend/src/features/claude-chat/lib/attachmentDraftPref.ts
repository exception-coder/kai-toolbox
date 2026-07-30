import { useCallback, useSyncExternalStore } from 'react'
import type { UploadedAttachment } from '../api'

/**
 * 输入框「待发送附件」的跨视图共享 store（按 sessionId）。与草稿（draftPref）同理：
 * 主界面 / 悬浮窗 / 分屏共用同一份，主界面选了附件再弹悬浮窗不丢、即时同步。
 *
 * 仅内存（不落 localStorage）：附件的 previewUrl 是本次页面加载的 object URL，刷新即失效，
 * 持久化没有意义；服务端 path 已随消息发送。跨「视图切换」共享才是本 store 的目标。
 */
export type DraftAttachment = UploadedAttachment & { previewUrl?: string }

const PENDING_KEY = '__pending__'
const store = new Map<string, DraftAttachment[]>()
const listeners = new Set<() => void>()
const EMPTY: DraftAttachment[] = []

function emit() { listeners.forEach(l => l()) }

function get(key: string): DraftAttachment[] {
  return store.get(key) ?? EMPTY
}

/** 覆盖式写入某会话的附件列表；空则删键（回落共享 EMPTY 引用，避免 useSyncExternalStore 抖动）。 */
export function setAttachmentsFor(key: string, next: DraftAttachment[]) {
  if (next.length === 0) store.delete(key)
  else store.set(key, next)
  emit()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}

/**
 * 绑定单个会话 key 的附件草稿，返回 [attachments, setAttachments]，用法与 useState 一致
 * （支持函数式更新）。跨组件即时同步。
 */
export function useDraftAttachments(
  key: string | null | undefined,
): [DraftAttachment[], (v: DraftAttachment[] | ((prev: DraftAttachment[]) => DraftAttachment[])) => void] {
  const k = key ?? PENDING_KEY
  const items = useSyncExternalStore(subscribe, () => get(k), () => EMPTY)
  const set = useCallback((v: DraftAttachment[] | ((prev: DraftAttachment[]) => DraftAttachment[])) => {
    const prev = get(k)
    const next = typeof v === 'function' ? (v as (p: DraftAttachment[]) => DraftAttachment[])(prev) : v
    setAttachmentsFor(k, next)
  }, [k])
  return [items, set]
}
