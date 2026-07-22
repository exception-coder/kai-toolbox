import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Loader2, X } from 'lucide-react'
import { getConsult } from '../api'

interface Props {
  sessionId: string
  title: string
  onClose: () => void
}

interface QaPair {
  question: string
  answer: string
}

function renderMarkdown(text: string): string {
  try {
    return DOMPurify.sanitize(marked.parse(text, { async: false }) as string)
  } catch {
    return DOMPurify.sanitize(text)
  }
}

/** 兜底：老/边缘记录 turns 为空时，从 raw_reference_json（原始 chat.items）解析出问答对。 */
function parseRawPairs(raw: string | null | undefined): QaPair[] {
  if (!raw) return []
  try {
    const items = JSON.parse(raw) as Array<{ kind?: string; text?: string; displayText?: string }>
    if (!Array.isArray(items)) return []
    const out: QaPair[] = []
    let cur: { q: string; a: string[] } | null = null
    for (const it of items) {
      if (it.kind === 'user') {
        if (cur) out.push({ question: cur.q, answer: cur.a.join('\n\n') })
        cur = { q: it.displayText ?? it.text ?? '', a: [] }
      } else if (it.kind === 'assistant' && cur && (it.text ?? '').trim()) {
        cur.a.push(it.text ?? '')
      }
    }
    if (cur) out.push({ question: cur.q, answer: cur.a.join('\n\n') })
    return out
  } catch {
    return []
  }
}

const ROLE_LABEL: Record<string, string> = { IT: 'IT 客服', BIZ: '业务员' }

/** 历史咨询详情：只读查看已归档的问答（含 Markdown 渲染），全息风右侧滑出。 */
export function ConsultHistoryDetail({ sessionId, title, onClose }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['fore-consult-session', sessionId],
    queryFn: () => getConsult(sessionId),
  })

  const pairs = useMemo<QaPair[]>(() => {
    if (!data) return []
    if (data.turns.length > 0) return data.turns.map((t) => ({ question: t.question, answer: t.answer }))
    return parseRawPairs(data.rawReferenceJson)
  }, [data])

  return (
    <div className="absolute inset-0 z-40 flex justify-end" onClick={onClose}>
      <div
        className="fc-panel flex h-full w-[min(560px,94vw)] flex-col rounded-l-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-indigo-300/12 p-5">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.22em] text-sky-300/70">Consult Archive</div>
            <h2 className="truncate text-base font-semibold text-white">{title}</h2>
            {data && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-indigo-200/50">
                <span className="rounded-full border border-indigo-300/20 px-2 py-0.5">{ROLE_LABEL[data.role] ?? data.role}</span>
                {data.moduleNames.length > 0 && <span className="truncate">{data.moduleNames.join('、')}</span>}
                <span>{new Date(data.createdAt).toLocaleString()}</span>
              </div>
            )}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-indigo-200/70 hover:bg-white/10" aria-label="关闭">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 pt-10 text-sm text-indigo-200/50">
              <Loader2 className="size-4 animate-spin" /> 加载中…
            </div>
          ) : pairs.length === 0 ? (
            <p className="pt-10 text-center text-sm text-indigo-200/40">本次咨询没有归档的问答内容</p>
          ) : (
            pairs.map((p, i) => (
              <div key={i} className="space-y-2">
                {p.question.trim() && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm border border-sky-300/25 bg-sky-400/15 px-3 py-2 text-sm text-sky-50">
                      {p.question}
                    </div>
                  </div>
                )}
                {p.answer.trim() && (
                  <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-indigo-300/15 bg-white/[0.04] px-3.5 py-2.5">
                    <div className="fc-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.answer) }} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="border-t border-indigo-300/12 px-5 py-2.5 text-center text-[10px] text-indigo-200/35">
          只读归档 · {pairs.length} 轮问答
        </div>
      </div>
    </div>
  )
}
