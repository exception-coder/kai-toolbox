import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'

interface Options {
  sessionKey: string
  lastItemId?: string
  historyLoading?: boolean
  historyError?: string | null
  onLoadLatest?: () => Promise<boolean | null>
}

function useBottomAlignment(sessionKey: string) {
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const scrollerRef = useRef<HTMLElement | null>(null)
  const followingHeightRef = useRef(false)
  const frameRef = useRef<number | null>(null)
  const captureScroller = useCallback((element: HTMLElement | Window | null) => {
    scrollerRef.current = element instanceof HTMLElement ? element : null
  }, [])
  const settleJump = useCallback(() => {
    if (!followingHeightRef.current) return
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      const scroller = scrollerRef.current
      if (scroller && followingHeightRef.current) {
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' })
      }
    })
  }, [])
  const scrollToLatest = useCallback(() => {
    followingHeightRef.current = true
    virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'auto' })
    settleJump()
  }, [settleJump])
  const cancelAlignment = useCallback(() => {
    followingHeightRef.current = false
    if (frameRef.current !== null) { cancelAnimationFrame(frameRef.current); frameRef.current = null }
  }, [])
  useLayoutEffect(() => {
    cancelAlignment()
    return () => {
      cancelAlignment()
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [sessionKey, cancelAlignment])
  return { virtuosoRef, captureScroller, settleJump, scrollToLatest, cancelAlignment }
}

/** 最新消息导航先确认数据，再在提交后的列表中定位；上滑或切换会话撤销定位意图。 */
export function useLatestMessageNavigation({ sessionKey, lastItemId, historyLoading, historyError, onLoadLatest }: Options) {
  const alignment = useBottomAlignment(sessionKey)
  const { virtuosoRef, scrollToLatest, cancelAlignment } = alignment
  const generationRef = useRef(0)
  const followingRef = useRef(true)
  const [atBottom, setAtBottom] = useState(true)
  const [navigation, setNavigation] = useState<'loading' | 'ready' | 'error' | null>(null)

  const cancelJump = useCallback(() => {
    generationRef.current += 1
    cancelAlignment()
    followingRef.current = false
    setNavigation(null)
  }, [cancelAlignment])

  useLayoutEffect(() => {
    generationRef.current += 1
    followingRef.current = true
    setAtBottom(true)
    setNavigation(null)
    return () => {
      generationRef.current += 1
    }
  }, [sessionKey])

  useLayoutEffect(() => {
    if (historyLoading) return
    if (navigation === 'ready') {
      if (historyError) { setNavigation('error'); return }
      followingRef.current = true
      scrollToLatest()
      setNavigation(null)
    } else if (!navigation && followingRef.current && lastItemId) {
      // 最近页替换往往仍是 30 条，Virtuoso 按条数跟随不会处理这种更新。
      scrollToLatest()
    }
  }, [sessionKey, lastItemId, historyLoading, historyError, navigation, scrollToLatest])

  const jumpToBottom = useCallback(async () => {
    if (!onLoadLatest) { followingRef.current = true; scrollToLatest(); return }
    const generation = ++generationRef.current
    cancelAlignment()
    setNavigation('loading')
    try {
      const loaded = await onLoadLatest()
      if (generation !== generationRef.current) return
      setNavigation(loaded === false ? 'error' : 'ready')
    } catch {
      if (generation === generationRef.current) setNavigation('error')
    }
  }, [onLoadLatest, scrollToLatest, cancelAlignment])
  const onBottomStateChange = useCallback((bottom: boolean) => {
    setAtBottom(bottom)
    if (bottom) followingRef.current = true
  }, [])

  return { ...alignment, jumpToBottom, cancelJump, atBottom, onBottomStateChange,
    loadingLatest: navigation === 'loading' || (navigation === 'ready' && !!historyLoading),
    latestError: navigation === 'error' }
}
