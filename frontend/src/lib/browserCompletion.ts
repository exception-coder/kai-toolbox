const prefix = '::browser-complete{title="'
const marker = /^::browser-complete\{title="((?:[^"\\\r\n]|\\.)*)"\}/
const partial = /^::browser-complete\{title="(?:[^"\\\r\n]|\\.)*(?:\\|")?$/

/** Native completion is a status, not proof of success. Preserve code examples and following prose. */
export function browserCompletionText(text: string, streaming = false, showStatus = false): string {
  if (!text.includes('::') && !streaming) return text
  let fence = ''
  const lines = text.split('\n')
  return lines.map((line, index) => {
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (delimiter) {
      if (!fence) fence = delimiter[1]
      else if (delimiter[1].startsWith(fence) && !delimiter[2].trim()) fence = ''
      return line
    }
    if (fence) return line
    if (streaming && index === lines.length - 1 && (prefix.startsWith(line) || partial.test(line))) return ''
    return line.replace(marker, (_whole, title: string) => {
      if (!showStatus) return ''
      // Render a plain status label, never a success badge or executable Markdown from its title.
      return `浏览器操作状态：${title.replace(/\\(["\\])/g, '$1').replace(/([\\`*_{}\[\]<>#])/g, '\\$1')}\n\n`
    })
  }).join('\n')
}
