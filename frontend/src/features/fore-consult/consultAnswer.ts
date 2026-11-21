import { parseConsultRecognition, stripConsultRecognition } from './consultRecognition'

const browserMarkerPrefix = '::browser-complete{title="'
const browserMarker = /^::browser-complete\{title="(?:[^"\\\r\n]|\\.)*"\}/
const partialBrowserMarker = /^::browser-complete\{title="(?:[^"\\\r\n]|\\.)*(?:\\|")?$/

/** 浏览器宿主的完成指令不是业务答复。保留同一行后续正文和代码块里的字面示例。 */
export function visibleConsultAnswer(text: string, streaming = false): string {
  if (!text.includes('::') && !streaming) return stripConsultRecognition(text)
  let fence = ''
  const lines = text.split('\n')
  const visible = lines.map((line, index) => {
    const delimiter = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (delimiter) {
      if (!fence) fence = delimiter[1]
      else if (delimiter[1].startsWith(fence) && !delimiter[2].trim()) fence = ''
      return line
    }
    if (fence) return line
    if (streaming && index === lines.length - 1 && (browserMarkerPrefix.startsWith(line) || partialBrowserMarker.test(line))) return ''
    return line.replace(browserMarker, '')
  })
  return stripConsultRecognition(visible.join('\n'))
}

/** 识别块标记完整业务答复；没有可靠标记的旧记录保留原文，不按措辞猜测过程消息。 */
export function parseConsultAnswer(parts: string[]) {
  const finalIndex = parts.findLastIndex(part => parseConsultRecognition(part).recognition !== null)
  const selected = finalIndex < 0 ? parts : parts.slice(finalIndex)
  const parsed = parseConsultRecognition(selected.join('\n\n'))
  return { ...parsed, answer: selected.map(part => visibleConsultAnswer(part)).filter(Boolean).join('\n\n') }
}
