import type { ChatItem } from '../claude-chat/types'
import type { ArchiveTurnItem, ConsultAttRef } from './api'
import { parseConsultAnswer } from './consultAnswer'

/** 从 chat.items 抽取「用户问 → AI 答」成对轮次。 */
export function extractTurns(items: ChatItem[], attMeta: Map<string, { path: string; mime?: string | null }>): ArchiveTurnItem[] {
  type Acc = { question: string; answerParts: string[]; atts: ConsultAttRef[]; traceId?: string | null; createdAt?: number }
  const raw: Acc[] = []
  let cur: Acc | null = null
  for (const it of items) {
    if (it.kind === 'user') {
      if (cur) raw.push(cur)
      const atts: ConsultAttRef[] = (it.attachments ?? [])
        .map((a): ConsultAttRef | null => {
          const meta = attMeta.get(a.name)
          if (!meta?.path) return null
          return { name: a.name, path: meta.path, mime: a.mime ?? meta.mime ?? null }
        })
        .filter((x): x is ConsultAttRef => x !== null)
      cur = { question: it.displayText ?? it.text, answerParts: [], atts, createdAt: it.ts }
    } else if (it.kind === 'assistant' && cur) {
      if (it.text.trim()) cur.answerParts.push(it.text)
    } else if (it.kind === 'result' && cur) {
      cur.traceId = it.traceId
    }
  }
  if (cur) raw.push(cur)
  return raw.map((t, i) => {
    const parsed = parseConsultAnswer(t.answerParts)
    return {
      turnIndex: i + 1,
      createdAt: t.createdAt,
      question: t.question,
      answer: parsed.answer,
      refMenuPaths: parsed.recognition?.menuPaths.length ? JSON.stringify(parsed.recognition.menuPaths) : undefined,
      recognizedModuleNames: parsed.recognition?.moduleNames,
      problemCategory: parsed.recognition?.problemCategory,
      recognitionStatus: parsed.recognition?.recognitionStatus,
      recognitionEvidence: parsed.recognition?.evidence,
      traceId: t.traceId,
      attachments: t.atts.length ? t.atts : undefined,
    }
  })
}
