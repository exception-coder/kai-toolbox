import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { Copy, Loader2, X } from 'lucide-react'
import { getConsult, type ConsultAttRef, type ConsultSessionView, type ConsultTurnView, type FeedbackView } from '../api'
import { stripConsultRecognition } from '../consultRecognition'
import { ImageLightbox } from './ImageLightbox'
import { ConsultAnswerContent, ConsultPanel } from './ConsultPanel'
import { ConsultDocuments } from './ConsultDocuments'

interface Props {
  sessionId: string
  title: string
  onClose: () => void
  embedded?: boolean
  onResume?: (session: ConsultSessionView) => void
}

interface QaPair {
  turnIndex: number
  question: string
  answer: string
  attachments?: ConsultAttRef[]
  recognizedSystemName?: string | null
  recognizedModuleNames?: string[]
  refMenuPaths?: string | null
  problemCategory?: string | null
  recognitionStatus?: string | null
  recognitionEvidence?: string[]
  traceId?: string | null
}

const CATEGORY_LABELS: Record<string, string> = {
  MENU_OPERATION: '菜单操作', BUSINESS_RULE: '业务规则', PAGE_OR_API_ERROR: '页面/接口异常',
  DATA_ANOMALY: '数据异常', SQL_OR_SCHEMA: 'SQL/表结构', CROSS_SYSTEM: '跨系统', OTHER: '其他',
}
const STATUS_LABELS: Record<string, string> = { CONFIRMED: '已确认', PARTIAL: '部分识别', UNRECOGNIZED: '未识别' }
const EVIDENCE_LABELS: Record<string, string> = {
  USER_SELECTION: '用户选择', MODULE_CATALOG: '模块目录', MENU_KNOWLEDGE: '菜单知识', CORE_SPEC: 'Core Spec',
  GRAPHIFY: 'Graphify', SOURCE_CODE: '源码', DDL: 'DDL', RUNTIME_DATA: '运行数据',
}

function menuPathsOf(value: string | null | undefined): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function pairOfTurn(turn: ConsultTurnView): QaPair {
  return {
    turnIndex: turn.turnIndex,
    question: turn.question,
    answer: stripConsultRecognition(turn.answer),
    attachments: turn.attachments,
    recognizedSystemName: turn.recognizedSystemName,
    recognizedModuleNames: turn.recognizedModuleNames,
    refMenuPaths: turn.refMenuPaths,
    problemCategory: turn.problemCategory,
    recognitionStatus: turn.recognitionStatus,
    recognitionEvidence: turn.recognitionEvidence,
    traceId: turn.traceId,
  }
}

const fileUrl = (path: string) => `/api/claude-chat/attachments/file?path=${encodeURIComponent(path)}`
const isImage = (a: ConsultAttRef) => (a.mime ?? '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(a.name)

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
    const items = JSON.parse(raw) as Array<{ kind?: string; text?: string; displayText?: string; traceId?: string | null }>
    if (!Array.isArray(items)) return []
    const out: QaPair[] = []
    let cur: { q: string; a: string[]; traceId?: string | null } | null = null
    for (const it of items) {
      if (it.kind === 'user') {
        if (cur) out.push({ turnIndex: out.length + 1, question: cur.q, answer: stripConsultRecognition(cur.a.join('\n\n')), traceId: cur.traceId })
        cur = { q: it.displayText ?? it.text ?? '', a: [] }
      } else if (it.kind === 'assistant' && cur && (it.text ?? '').trim()) {
        cur.a.push(it.text ?? '')
      } else if (it.kind === 'result' && cur) {
        cur.traceId = it.traceId
      }
    }
    if (cur) out.push({ turnIndex: out.length + 1, question: cur.q, answer: stripConsultRecognition(cur.a.join('\n\n')), traceId: cur.traceId })
    return out
  } catch {
    return []
  }
}

const ROLE_LABEL: Record<string, string> = { IT: 'IT 客服', BIZ: '业务员' }
const SESSION_LINK_RETRY_MS = 2000
const SESSION_LINK_WAIT_MS = 30000

/** 归档问答兜底阅读：移动端内嵌工作台，桌面保留侧栏。 */
export function ConsultHistoryDetail({ sessionId, title, onClose, embedded = false, onResume }: Props) {
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [connectionTimedOut, setConnectionTimedOut] = useState(false)
  const [connectionAttempt, setConnectionAttempt] = useState(0)
  const resumed = useRef<string | null>(null)
  useEffect(() => {
    resumed.current = null
  }, [sessionId])
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['fore-consult-session', sessionId],
    queryFn: () => getConsult(sessionId),
    refetchInterval: query => onResume && query.state.data?.archiveStatus === 'PENDING'
      && !query.state.data.devSessionId && !connectionTimedOut
      ? SESSION_LINK_RETRY_MS : false,
  })
  const waitingForLink = Boolean(onResume && data?.archiveStatus === 'PENDING' && !data.devSessionId)
  useEffect(() => {
    setConnectionTimedOut(false)
    if (!waitingForLink) return
    // 独立计时，避免轮询失败或最后一次响应未触发渲染时一直显示连接中。
    const timeout = window.setTimeout(() => setConnectionTimedOut(true), SESSION_LINK_WAIT_MS)
    return () => window.clearTimeout(timeout)
  }, [sessionId, waitingForLink, connectionAttempt])
  useEffect(() => {
    if (!onResume || data?.archiveStatus !== 'PENDING' || !data.devSessionId || resumed.current === data.sessionId) return
    resumed.current = data.sessionId
    onResume(data)
  }, [data, onResume])

  const pairs = useMemo<QaPair[]>(() => {
    if (!data) return []
    if (data.turns.length > 0) return data.turns.map(pairOfTurn)
    return parseRawPairs(data.rawReferenceJson)
  }, [data])

  const feedbackByTurn = useMemo(() => {
    const m = new Map<number, FeedbackView>()
    for (const f of data?.feedback ?? []) m.set(f.turnIndex, f)
    return m
  }, [data])

  return (
    <div className={embedded ? 'flex h-full min-h-0 flex-col bg-[#f8f9fb]' : 'absolute inset-0 z-40 flex justify-end'} onClick={embedded ? undefined : onClose}>
      <ConsultPanel embedded={embedded} side="right" initialWidth={560} className="fc-panel rounded-xl">
        {sizeControls => <>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <div className="text-xs text-slate-500">历史咨询</div>
            <h2 className="break-words text-base font-semibold text-slate-950">{title}</h2>
            {data && (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span className="rounded-full border border-slate-200 px-2 py-0.5">{ROLE_LABEL[data.role] ?? data.role}</span>
                <span className="rounded-full border border-sky-200 px-2 py-0.5">发起系统：{data.systemName}</span>
                {(data.evidenceSystems ?? []).filter((item) => item.toLowerCase() !== data.systemName.toLowerCase()).map((item) => (
                  <span key={item} className="rounded-full border border-emerald-200 px-2 py-0.5 text-emerald-700">
                    证据系统：{item.toUpperCase()}
                  </span>
                ))}
                {data.moduleNames.length > 0 && <span className="truncate">{data.moduleNames.join('、')}</span>}
                <span>{new Date(data.createdAt).toLocaleString()}</span>
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
          {sizeControls}
          <button type="button" onClick={onClose} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="返回历史咨询">
            <X className="size-4" />
          </button>
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 pt-10 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" /> 加载中…
            </div>
          ) : isError && !data ? <div role="alert" className="text-sm text-slate-600">咨询内容加载失败，记录仍保留。<button type="button" className="ml-2 min-h-11 underline" onClick={() => void refetch()}>重试加载</button></div> : <>
          {isError && <div role="alert" className="text-sm leading-6 text-slate-600">检查原会话失败，已保存的内容仍可阅读。<button type="button" className="ml-2 min-h-11 underline" onClick={() => void refetch()}>重试检查</button></div>}
          {waitingForLink && !isError && (
            <div role="status" className="text-sm leading-6 text-slate-600">
              <p>{connectionTimedOut ? '尚未找到关联的原会话，已停止自动连接。咨询记录仍保留。' : '正在连接原会话…'}</p>
              <button type="button" className="min-h-11 underline" onClick={() => { setConnectionTimedOut(false); setConnectionAttempt(value => value + 1); void refetch() }}>重新检查连接</button>
            </div>
          )}
          {pairs.length === 0 ? (
            <p className="text-sm leading-6 text-slate-600">
              {data?.archiveStatus === 'PENDING'
                ? '暂时没有保存的问答内容。'
                : '本次咨询没有归档的问答内容'}
            </p>
          ) : (
            pairs.map((p, i) => (
              <div key={i} className="space-y-2">
                {p.attachments && p.attachments.length > 0 && (
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {p.attachments.map((a, j) =>
                      isImage(a) ? (
                        <img key={j} src={fileUrl(a.path)} alt={a.name} title={a.name} onClick={() => setLightbox(fileUrl(a.path))} className="size-20 cursor-zoom-in rounded-lg border border-slate-200 object-cover transition-transform hover:scale-[1.03]" />
                      ) : (
                        <span key={j} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600">📄 {a.name}</span>
                      ),
                    )}
                  </div>
                )}
                {p.question.trim() && (
                  <div className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-slate-800">
                      {p.question}
                    </div>
                  </div>
                )}
                {p.traceId && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(p.traceId!)}
                      className="inline-flex max-w-[92%] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 font-mono text-[10px] text-slate-500 hover:border-sky-300 hover:text-sky-700"
                      title="复制本轮 Trace ID，可在 Langfuse 中直接检索"
                    >
                      <Copy className="size-3" /> Trace {p.traceId}
                    </button>
                  </div>
                )}
                {p.recognitionStatus && (
                  <div className="max-w-[92%] rounded-xl border border-violet-200 bg-violet-50/60 px-3 py-2.5 text-[11px] text-slate-700">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-violet-700">V4 问题识别</span>
                      {p.recognizedSystemName && <span className="rounded-full border border-sky-300/20 px-2 py-0.5">系统：{p.recognizedSystemName}</span>}
                      {p.problemCategory && <span className="rounded-full border border-violet-300/20 px-2 py-0.5">分类：{CATEGORY_LABELS[p.problemCategory] ?? p.problemCategory}</span>}
                      <span className="rounded-full border border-indigo-300/20 px-2 py-0.5">状态：{STATUS_LABELS[p.recognitionStatus] ?? p.recognitionStatus}</span>
                    </div>
                    {!!p.recognizedModuleNames?.length && <div><span className="text-slate-500">模块：</span>{p.recognizedModuleNames.join('、')}</div>}
                    {menuPathsOf(p.refMenuPaths).map((path) => <div key={path}><span className="text-slate-500">菜单路径：</span>{path}</div>)}
                    {!!p.recognitionEvidence?.length && <div className="mt-1"><span className="text-slate-500">识别依据：</span>{p.recognitionEvidence.map((item) => EVIDENCE_LABELS[item] ?? item).join('、')}</div>}
                  </div>
                )}
                {p.answer.trim() && (
                  <div className="min-w-0 max-w-full rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3.5 py-2.5">
                    <ConsultAnswerContent text={p.answer}><div className="fc-md" dangerouslySetInnerHTML={{ __html: renderMarkdown(p.answer) }} /></ConsultAnswerContent>
                  </div>
                )}
                {(() => {
                  const fb = feedbackByTurn.get(p.turnIndex)
                  if (!fb) return null
                  return (
                    <div
                      className={`max-w-[92%] rounded-lg border px-3 py-1.5 text-[11px] ${
                        fb.rating === 'GOOD' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
                      }`}
                    >
                      <div className="font-medium">
                        {fb.rating === 'GOOD' ? '👍 用户反馈：满意' : `👎 用户反馈：不满意${fb.category ? ' · ' + fb.category : ''}`}
                      </div>
                      {fb.reason && <div className="mt-0.5 text-slate-600">原因：{fb.reason}</div>}
                      {fb.correctAnswer && <div className="mt-0.5 text-slate-600">正确答案：{fb.correctAnswer}</div>}
                    </div>
                  )
                })()}
              </div>
            ))
          )}
          </>}
        </div>

        <div className="max-h-48 overflow-y-auto px-5"><ConsultDocuments key={sessionId} sessionId={sessionId} /></div>
        <div className="border-t border-slate-200 px-5 py-2.5 text-center text-[10px] text-slate-500">
          {waitingForLink ? '尚未关联原会话' : `${data?.archiveStatus === 'PENDING' ? '历史快照' : '已归档 · 不再接受追问'} · ${pairs.length} 轮问答`}
        </div>
        </>}
      </ConsultPanel>
      {lightbox && <ImageLightbox src={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}
