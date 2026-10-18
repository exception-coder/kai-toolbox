/** 回复与轮次详情共用的剪贴板写入；旧浏览器保留原降级路径。 */
export async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const selection = window.getSelection()
    const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : []
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.readOnly = true
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    try {
      textarea.select()
      if (!document.execCommand('copy')) throw new Error('复制失败，请重试或手动选择正文')
    } finally {
      textarea.remove()
      if (active?.isConnected) active.focus({ preventScroll: true })
      selection?.removeAllRanges()
      for (const range of ranges) if (range.commonAncestorContainer.isConnected) selection?.addRange(range)
    }
  }
}
