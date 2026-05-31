import { useCallback, useEffect, useState } from 'react'

export interface SelectionInfo {
  text: string
  anchorRect: DOMRect | null
}

/**
 * 监听某个容器内的文本选区。selectedText 为空表示无选区。
 * 触发 parameterize 气泡时调用方读 anchorRect 算气泡位置。
 *
 * 用法：用一个 ref 把容器传进来；选中文本时返回 { text, anchorRect }。
 */
export function useTextSelection(container: HTMLElement | null): SelectionInfo {
  const [info, setInfo] = useState<SelectionInfo>({ text: '', anchorRect: null })

  const update = useCallback(() => {
    if (!container) { setInfo({ text: '', anchorRect: null }); return }
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setInfo({ text: '', anchorRect: null })
      return
    }
    const range = sel.getRangeAt(0)
    // 必须落在容器内
    if (!container.contains(range.commonAncestorContainer)) {
      setInfo({ text: '', anchorRect: null })
      return
    }
    const text = sel.toString()
    if (!text || text.length > 500) {
      setInfo({ text: '', anchorRect: null })
      return
    }
    setInfo({ text, anchorRect: range.getBoundingClientRect() })
  }, [container])

  useEffect(() => {
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [update])

  return info
}
