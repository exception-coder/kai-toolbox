/** 回复与轮次详情共用的剪贴板写入；旧浏览器保留原降级路径。 */
export async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    try { document.execCommand('copy') } catch { /* 剪贴板拒绝时保留原文供手动复制。 */ }
    document.body.removeChild(textarea)
  }
}
