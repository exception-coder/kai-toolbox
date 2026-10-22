import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { VirtuosoHandle } from 'react-virtuoso'

// 窄浮窗的消息底部边距和虚拟列表测量可相差数像素，导航与跟随必须使用同一容差。
export const LATEST_BOTTOM_TOLERANCE_PX = 8

interface Options {
  sessionKey: string
  lastItemId?: string
  historyLoading?: boolean
  historyError?: string | null
  /** 正在接收的实时流可能领先于落盘历史，显式跳转不以旧快照替换它。 */
  liveOutput?: boolean
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
    if (!followingHeightRef.current || frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      const scroller = scrollerRef.current
      if (scroller && followingHeightRef.current
        && scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > LATEST_BOTTOM_TOLERANCE_PX) {
        // 尺寸测量、重试和滚动都由虚拟列表持有，不能再用 DOM scrollTo 抢写位置。
        virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'auto' })
      }
    })
  }, [])
  const scrollToLatest = useCallback(() => {
    followingHeightRef.current = true
    virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'auto' })
  }, [])
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
  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || typeof ResizeObserver === 'undefined') return
    // 队列、运行状态或输入框会改变视口高度，消息总高度可能完全不变。
    const observer = new ResizeObserver(settleJump)
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [sessionKey, settleJump])
  return { virtuosoRef, captureScroller, settleJump, scrollToLatest, cancelAlignment }
}

/** 实时输出直接定位，历史恢复先确认数据；上滑或切换会话撤销定位意图。 */
export function useLatestMessageNavigation({ sessionKey, lastItemId, historyLoading, historyError, liveOutput, onLoadLatest }: Options) {
  const alignment = useBottomAlignment(sessionKey)
  const { scrollToLatest, cancelAlignment } = alignment
  const generationRef = useRef(0)
  const followingRef = useRef(true)
  const alignedItemRef = useRef<string | undefined>(undefined)
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
    alignedItemRef.current = undefined
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
      alignedItemRef.current = lastItemId
      scrollToLatest()
      setNavigation(null)
    } else if (!navigation && followingRef.current && lastItemId && alignedItemRef.current !== lastItemId) {
      // 最近页替换往往仍是 30 条，Virtuoso 按条数跟随不会处理这种更新。
      alignedItemRef.current = lastItemId
      scrollToLatest()
    }
  }, [sessionKey, lastItemId, historyLoading, historyError, navigation, scrollToLatest])

  const jumpToBottom = useCallback(async () => {
    const generation = ++generationRef.current
    if (!onLoadLatest || liveOutput && lastItemId && !historyLoading) {
      followingRef.current = true
      alignedItemRef.current = lastItemId
      setNavigation(null)
      scrollToLatest()
      return
    }
    cancelAlignment()
    setNavigation('loading')
    try {
      const loaded = await onLoadLatest()
      if (generation !== generationRef.current) return
      setNavigation(loaded === false ? 'error' : 'ready')
    } catch {
      if (generation === generationRef.current) setNavigation('error')
    }
  }, [onLoadLatest, liveOutput, lastItemId, historyLoading, scrollToLatest, cancelAlignment])
  const onBottomStateChange = useCallback((bottom: boolean) => {
    setAtBottom(bottom)
    if (bottom) followingRef.current = true
    // 这里只报告位置，不以滚动结果再次驱动滚动；尺寸变化才触发补齐。
  }, [])

  return { ...alignment, jumpToBottom, cancelJump, atBottom, onBottomStateChange,
    loadingLatest: navigation === 'loading' || (navigation === 'ready' && !!historyLoading),
    latestError: navigation === 'error' }
}
