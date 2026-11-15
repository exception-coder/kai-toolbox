import { parseConsultRecognition } from './consultRecognition'

/** 识别块标记完整业务答复；没有可靠标记的旧记录保留原文，不按措辞猜测过程消息。 */
export function parseConsultAnswer(parts: string[]) {
  const finalIndex = parts.findLastIndex(part => parseConsultRecognition(part).recognition !== null)
  const selected = finalIndex < 0 ? parts : parts.slice(finalIndex)
  const parsed = parseConsultRecognition(selected.join('\n\n'))
  return { ...parsed, answer: selected.map(part => parseConsultRecognition(part).answer).filter(Boolean).join('\n\n') }
}
