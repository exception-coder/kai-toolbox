import { useCallback, useEffect, useRef, useState, type Ref } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { renameSession } from '../api'
import { renameSessionOptimistically } from '../lib/optimisticSessionRename'

interface Options {
  currentSessionId: string | undefined
  currentTitle: string | undefined
  controlRef?: Ref<HTMLButtonElement>
}

/**
 * 顶栏会话标题的就地重命名：绑定开始编辑时的会话、乐观更新、失败提示与焦点归还。
 * 从 ChatPage 拆出，行为与原实现一致。
 */
export function useSessionTitleEdit({ currentSessionId, currentTitle, controlRef }: Options) {
  const qc = useQueryClient()
  // 编辑绑定开始时的会话；短按改名与长按模式选择互不触发。
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [titleRenameError, setTitleRenameError] = useState<string | null>(null)
  const titleEditTarget = useRef<{ id: string; title: string } | null>(null)
  const titleTriggerRef = useRef<HTMLButtonElement>(null)
  const titleSessionId = useRef(currentSessionId)
  titleSessionId.current = currentSessionId
  const attachTitleTrigger = useCallback((node: HTMLButtonElement | null) => {
    titleTriggerRef.current = node
    if (typeof controlRef === 'function') controlRef(node)
    else if (controlRef) controlRef.current = node
  }, [controlRef])
  const wasEditingTitle = useRef(false)
  useEffect(() => {
    if (wasEditingTitle.current && !editingTitle) titleTriggerRef.current?.focus({ preventScroll: true })
    wasEditingTitle.current = editingTitle
  }, [editingTitle])
  useEffect(() => {
    titleEditTarget.current = null
    setEditingTitle(false)
    setTitleRenameError(null)
  }, [currentSessionId])
  const startEditTitle = () => {
    if (!currentSessionId) return
    titleEditTarget.current = { id: currentSessionId, title: currentTitle ?? '' }
    setTitleRenameError(null)
    setTitleDraft(currentTitle ?? '')
    setEditingTitle(true)
  }
  const cancelEditTitle = () => {
    titleEditTarget.current = null
    setEditingTitle(false)
  }
  const commitEditTitle = async () => {
    const t = titleDraft.trim()
    const target = titleEditTarget.current
    if (!target || target.id !== currentSessionId) return
    titleEditTarget.current = null
    setEditingTitle(false)
    if (t && t !== target.title) {
      try {
        await renameSessionOptimistically(qc, target.id, t, renameSession)
      } catch (error) {
        if (titleSessionId.current === target.id) setTitleRenameError(`重命名失败：${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  return {
    editingTitle, titleDraft, setTitleDraft, titleRenameError, titleTriggerRef, attachTitleTrigger,
    startEditTitle, cancelEditTitle, commitEditTitle,
  }
}
