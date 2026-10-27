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
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const followingHeightRef = useRef(false)
  const correctedLayoutsRef = useRef(new Set<string>())
  const frameRef = useRef<number | null>(null)
  const captureScroller = useCallback((element: HTMLElement | Window | null) => {
    scrollerRef.current = element instanceof HTMLElement ? element : null
    setScroller(scrollerRef.current)
  }, [])
  const scrollToMeasuredBottom = useCallback(() => {
    const scroller = scrollerRef.current
    if (scroller) {
      // 长历史的索引估算可能停在旧回复；读取真实范围，仍只由 Virtuoso 写滚动位置。
      virtuosoRef.current?.scrollTo({ top: Math.max(0, scroller.scrollHeight - scroller.clientHeight), behavior: 'auto' })
    } else {
      virtuosoRef.current?.scrollToIndex({ index: 'LAST', align: 'end', behavior: 'auto' })
    }
  }, [])
  const settleJump = useCallback(() => {
    if (!followingHeightRef.current || frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null
      const scroller = scrollerRef.current
      if (scroller && followingHeightRef.current
        && scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > LATEST_BOTTOM_TOLERANCE_PX) {
        // 同一测量范围只补偿一次，防止原生 scroll 与 Virtuoso 的位置补偿互相触发。
        const layout = `${scroller.scrollHeight}:${scroller.clientHeight}`
        if (correctedLayoutsRef.current.has(layout)) return
        correctedLayoutsRef.current.add(layout)
        scrollToMeasuredBottom()
      }
    })
  }, [scrollToMeasuredBottom])
  const scrollToLatest = useCallback(() => {
    followingHeightRef.current = true
    correctedLayoutsRef.current.clear()
    scrollToMeasuredBottom()
  }, [scrollToMeasuredBottom])
  const cancelAlignment = useCallback(() => {
    followingHeightRef.current = false
    correctedLayoutsRef.current.clear()
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
    if (!scroller) return
    // 虚拟列表可能在跳转后补偿位置而不改变总高度；只在跟随意图仍有效时补齐。
    scroller.addEventListener('scroll', settleJump, { passive: true })
    // 队列、运行状态或输入框会改变视口高度，消息总高度可能完全不变。
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(settleJump)
    observer?.observe(scroller)
    return () => { observer?.disconnect(); scroller.removeEventListener('scroll', settleJump) }
  }, [scroller, settleJump])
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
