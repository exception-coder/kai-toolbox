import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BotMessageSquare, Loader2, Send, Sparkles, User, X } from 'lucide-react'
import {
  askNextQuestion,
  distributeAnswer,
  getSession,
  saveQaHistory,
  startClarify,
  type QaPair,
} from '../../api'
import type { QuestionItem } from '../../types'
import type { ClarifyEngine } from '../dialogs/StartClarifyDialog'
import { ClarificationAnswerComposer, ClarificationAnswerView } from './ClarificationAnswerComposer'

export function ChattingPanel({
  sessionId,
  engine,
  maxRounds,
  initialHistory,
  onDone,       // 澄清完成，带完整 history 调用
  onError,
}: {
  sessionId: string
  engine: ClarifyEngine
  /** 本次澄清最多问几轮，来自 session.maxQuestions（开始澄清前确认弹框按需求类型预填/用户可调，
   *  1-2/3-5/6-8 或自定义）。真正的轮数上限由后端 askNextQuestion 强制，这里只是展示进度用，
   *  不做客户端侧的提前拦截。 */
  maxRounds: number
  /** 断点续问：session.questions 里已经答过的部分（进入本面板前由父组件读出，见 PrdClarifyPage），
   *  非空时跳过已问过的题，直接从下一题继续，不重复问。 */
  initialHistory?: QaPair[]
  onDone: (history: QaPair[]) => void
  onError: (msg: string) => void
}) {
  const engineName = engine === 'codex' ? 'Codex' : 'Claude Code'
  const [history, setHistory] = useState<QaPair[]>(() => initialHistory ?? [])  // 已完成的 Q&A
  const [currentQ, setCurrentQ] = useState('')                  // 当前问题（流式积累）
  const [currentA, setCurrentA] = useState('')                  // 用户正在输入的答案
  const [isStreaming, setIsStreaming] = useState(true)          // Claude 正在输出问题
  const [answerUploading, setAnswerUploading] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)  // 逐题自动保存失败提示
  const abortRef = useRef<(() => void) | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' })

  // 挂载时立即问下一题：有断点续问历史就接着问，没有就从第 0 题开始
  useEffect(() => {
    const resumeHistory = initialHistory ?? []
    askQuestion(resumeHistory.length, resumeHistory)
    return () => abortRef.current?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { scrollToBottom() }, [history, currentQ])

  // 当 Claude 输出完毕后聚焦输入框
  useEffect(() => {
    if (!isStreaming && currentQ && !currentQ.includes('[CLARIFICATION_COMPLETE]')) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isStreaming, currentQ])

  const askQuestion = (index: number, hist: QaPair[]) => {
    setCurrentQ('')
    setIsStreaming(true)
    const accRef = { current: '' }

    const abort = askNextQuestion(sessionId, index, hist, {
      onEvent(name, data) {
        if (name === 'chunk') {
          const chunk = (data as { content: string }).content ?? ''
          accRef.current += chunk
          setCurrentQ(accRef.current)
        }
        if (name === 'done') {
          setIsStreaming(false)
          const text = accRef.current.trim()
          if (text.includes('[CLARIFICATION_COMPLETE]')) {
            // 澄清完成，把历史传给父组件
            onDone(hist)
          }
        }
        if (name === 'error') {
          setIsStreaming(false)
          onError((data as { message: string }).message ?? '澄清失败')
        }
      },
      onError() {
        setIsStreaming(false)
        onError('SSE 连接失败，请重试')
      },
    })
    abortRef.current = abort
  }

  const handleSubmitAnswer = () => {
    if (answerUploading) return
    const answer = currentA.trim()
    if (!answer) return

    const newPair: QaPair = { question: currentQ, answer }
    const newHistory = [...history, newPair]
    setHistory(newHistory)
    setCurrentA('')
    setCurrentQ('')

    // 逐题自动落库：不等它完成就问下一题（不阻塞交互），中途意外退出/刷新最多丢当前
    // 正在输入还没提交的这一题，已提交的都在库里。saveQaHistory 整体覆盖 session.questions，
    // 每次传完整累计 history 即可，失败只提示不阻断——下一次答题会带着更新后的 newHistory
    // 重试覆盖，不会丢已经保存成功的部分。
    saveQaHistory(sessionId, newHistory)
      .then(() => setSaveError(null))
      .catch(() => setSaveError('本题进度自动保存失败，请留意网络状况，避免中途退出丢失回答'))

    // 触发下一个问题
    askQuestion(newHistory.length, newHistory)
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmitAnswer()
    }
  }

  const isDone = !isStreaming && currentQ.includes('[CLARIFICATION_COMPLETE]')
  const progress = Math.min(100, Math.round((history.length / maxRounds) * 100))

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 进度条 + 角色提示 */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-[var(--color-border)] bg-[var(--color-card)]">
        <span className="text-xs text-[var(--color-muted-foreground)]">
          AI 渐进澄清：{history.length} / {maxRounds} 题
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-[var(--color-muted)]">
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        {isStreaming && (
          <div className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
            <Loader2 className="w-3 h-3 animate-spin" />
            {engineName} 思考中…
          </div>
        )}
      </div>

      {/* 逐题自动保存失败提示：不阻断继续澄清，但要让用户知道进度可能没落库 */}
      {saveError && (
        <div className="px-5 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-500">
          ⚠ {saveError}
        </div>
      )}

      {/* 对话气泡区 */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

        {/* 第一题生成中：Claude 正在查知识图谱（此时 history=[] currentQ=''） */}
        {isStreaming && !currentQ && history.length === 0 && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0">
              <BotMessageSquare className="w-4 h-4 text-[var(--color-primary)]" />
            </div>
            <div className="flex-1 rounded-2xl rounded-tl-sm bg-[var(--color-muted)]/30 border border-[var(--color-border)] px-4 py-3 max-w-2xl">
              <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)] mb-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-primary)]" />
                <span>{engineName} 正在分析需求，查询知识图谱…</span>
              </div>
              <div className="space-y-1.5 text-[11px] text-[var(--color-muted-foreground)]">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  <span>读取 domain-knowledge（业务规则/状态机）</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" style={{ animationDelay: '0.3s' }} />
                  <span>读取 graphify（代码结构/已有实现）</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" style={{ animationDelay: '0.6s' }} />
                  <span>结合 PRD 生成精准澄清问题…</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 历史 Q&A */}
        {history.map((qa, i) => (
          <div key={i} className="space-y-2">
            {/* Claude 气泡 */}
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0">
                <BotMessageSquare className="w-4 h-4 text-[var(--color-primary)]" />
              </div>
              <div className="flex-1 rounded-2xl rounded-tl-sm bg-[var(--color-muted)]/50 px-4 py-2.5 text-sm leading-relaxed max-w-2xl">
                {qa.question}
              </div>
            </div>
            {/* 用户气泡 */}
            <div className="flex items-start gap-3 justify-end">
              <div className="flex-1 rounded-2xl rounded-tr-sm bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 px-4 py-2.5 text-sm leading-relaxed max-w-2xl text-right ml-8">
                <ClarificationAnswerView value={qa.answer} />
              </div>
              <div className="w-7 h-7 rounded-full bg-[var(--color-muted)] flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-[var(--color-muted-foreground)]" />
              </div>
            </div>
          </div>
        ))}

        {/* 当前问题（流式中或已完成） */}
        {currentQ && !isDone && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0">
              <BotMessageSquare className="w-4 h-4 text-[var(--color-primary)]" />
            </div>
            <div className="flex-1 rounded-2xl rounded-tl-sm bg-[var(--color-muted)]/50 px-4 py-2.5 text-sm leading-relaxed max-w-2xl">
              {currentQ}
              {isStreaming && (
                <span className="inline-block w-1.5 h-4 bg-[var(--color-primary)] rounded animate-pulse ml-1 align-middle" />
              )}
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* 输入区 */}
      {!isDone && !isStreaming && currentQ && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="flex gap-2 items-end max-w-3xl mx-auto">
            <ClarificationAnswerComposer
              textareaRef={inputRef}
              value={currentA}
              onChange={setCurrentA}
              onKeyDown={handleKeyDown}
              rows={3}
              placeholder="输入你的回答… (Ctrl+Enter 提交)"
              onUploadingChange={setAnswerUploading}
            />
            <button
              disabled={!currentA.trim() || answerUploading}
              onClick={handleSubmitAnswer}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 self-end"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-center text-[var(--color-muted-foreground)] mt-2">
            {engineName} 会根据你的回答动态追问，最多 {maxRounds} 轮
          </p>
        </div>
      )}

      {/* 流式中占位输入区 */}
      {isStreaming && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="max-w-3xl mx-auto h-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/30 flex items-center gap-2 px-3 text-xs text-[var(--color-muted-foreground)]">
            <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
            <span className="italic">
              {currentQ
                ? `${engineName} 正在输出问题…`
                : `${engineName} 正在查询知识图谱，生成精准问题中（约 10-30 秒）…`}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 批量澄清面板（Step CHATTING，批量模式）：一次性生成 session.maxQuestions 道题（后端
 * PrdClarifyService.clarify），用户一次性填完再统一提交——跟 ChattingPanel（渐进模式，
 * 逐题追问）并列的两种交互，由 StartClarifyDialog 里选。
 */
export function BatchClarifyPanel({
  sessionId,
  initialQuestions,
  onDone,
  onError,
}: {
  sessionId: string
  /** 断点续问：session.questions 里已经生成/部分填过的题目（进入本面板前由父组件读出），
   *  非空时跳过重新生成，直接展示这些题目继续填，不重复调一次生成。 */
  initialQuestions: QuestionItem[]
  onDone: (history: QaPair[]) => void
  onError: (msg: string) => void
}) {
  const [questions, setQuestions] = useState<QuestionItem[]>(initialQuestions)
  const [answers, setAnswers] = useState<string[]>(() => initialQuestions.map((q) => q.answer ?? ''))
  const [generating, setGenerating] = useState(initialQuestions.length === 0)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [uploadingAnswers, setUploadingAnswers] = useState<Set<number>>(() => new Set())
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── 一次性回答：整段写/粘贴 → 交给模型拆分归位到各题（省掉逐题复制粘贴的体力活）。
  // 默认折叠：逐题作答质量更高（每题针对性回答、不容易漏），一次性回答是给"已经在别处
  // 想清楚了、只想快点贴进来"的场景兜底，不该是首选路径。
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [distributing, setDistributing] = useState(false)
  const [distributeError, setDistributeError] = useState<string | null>(null)
  /** 上一次分配的结果摘要 + 分配前的答案快照（供「撤销分配」原样还原） */
  const [distributeResult, setDistributeResult] = useState<
    { matchedCount: number; total: number; unmatchedNumbers: number[]; leftover: string; snapshot: string[] } | null
  >(null)

  // 挂载时：已有题目（断点续问，或刚生成完再次渲染）就不重复生成；否则调批量生成接口
  useEffect(() => {
    if (questions.length > 0) return
    setGenerating(true)
    const abort = startClarify(sessionId, {
      onEvent(name) {
        if (name === 'done') {
          getSession(sessionId)
            .then((s) => {
              setQuestions(s.questions)
              setAnswers(s.questions.map((q) => q.answer ?? ''))
              setGenerating(false)
            })
            .catch(() => {
              setGenerating(false)
              onError('生成问题后读取失败，请重试')
            })
        }
        if (name === 'error') {
          setGenerating(false)
          onError('生成澄清问题失败，请重试')
        }
      },
      onError() {
        setGenerating(false)
        onError('SSE 连接失败，请重试')
      },
    })
    return () => abort()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 防抖自动保存草稿：任一答案变化 1s 后落库一次，避免中途退出丢失已填内容。
  // saveQaHistory 整体覆盖 session.questions，每次传完整 answers 快照即可。
  useEffect(() => {
    if (generating || questions.length === 0) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const hist = questions.map((q, i) => ({ question: q.question, answer: answers[i] ?? '' }))
      if (!hist.some((h) => h.answer.trim())) return  // 一个都没填，不用存
      saveQaHistory(sessionId, hist)
        .then(() => setSaveError(null))
        .catch(() => setSaveError('草稿自动保存失败，请留意网络状况，避免中途退出丢失已填内容'))
    }, 1000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, generating, questions.length])

  /** 立即保存当前草稿（不等 1s 防抖），失焦切字段/页面即将卸载时用，把"可能丢最后一次编辑"的窗口收到最小。 */
  const flushSaveNow = () => {
    if (generating || questions.length === 0) return
    const hist = questions.map((q, i) => ({ question: q.question, answer: answers[i] ?? '' }))
    if (!hist.some((h) => h.answer.trim())) return
    saveQaHistory(sessionId, hist).then(() => setSaveError(null)).catch(() => {})
  }

  // 页面即将卸载（关标签页/刷新/系统强杀前的 pagehide 事件）时兜底再存一次：普通 fetch 在卸载过程中
  // 大概率来不及完成，用 keepalive 让浏览器在页面已经关闭后继续把这个请求发出去，不走 http() 封装
  // （那里有一次 await ensureFreshToken() 异步预处理，卸载场景等不起），直接读 localStorage 里的 token。
  useEffect(() => {
    const flushOnUnload = () => {
      if (generating || questions.length === 0) return
      const hist = questions.map((q, i) => ({ question: q.question, answer: answers[i] ?? '' }))
      if (!hist.some((h) => h.answer.trim())) return
      const token = typeof localStorage !== 'undefined' ? localStorage.getItem('toolbox.auth.token') : null
      try {
        fetch(`/api/prd-clarify/sessions/${sessionId}/qa-history`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ history: hist }),
          keepalive: true,
        })
      } catch {
        // 卸载过程中的兜底保存，失败也没有地方展示错误了，静默即可
      }
    }
    window.addEventListener('pagehide', flushOnUnload)
    window.addEventListener('beforeunload', flushOnUnload)
    return () => {
      window.removeEventListener('pagehide', flushOnUnload)
      window.removeEventListener('beforeunload', flushOnUnload)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, generating, questions])

  const allAnswered = questions.length > 0 && answers.every((a) => a.trim())
  const answeredCount = answers.filter((a) => a.trim()).length

  /**
   * 把整段回答交给模型拆分归位。分配结果只填进输入框，用户仍需逐题核对——所以：
   * 模型没匹配到内容的题保留用户已经手填的答案（空串不覆盖非空），且保留分配前快照支持一键撤销。
   */
  const handleDistribute = async () => {
    if (!bulkText.trim() || distributing) return
    setDistributing(true)
    setDistributeError(null)
    try {
      const dist = await distributeAnswer(sessionId, bulkText.trim())
      const snapshot = [...answers]
      setAnswers((prev) =>
        questions.map((_, i) => {
          const assigned = (dist.answers[i] ?? '').trim()
          return assigned || prev[i] || ''
        }),
      )
      setDistributeResult({
        matchedCount: dist.matchedCount,
        total: questions.length,
        unmatchedNumbers: dist.unmatchedNumbers,
        leftover: dist.leftover,
        snapshot,
      })
    } catch (e) {
      setDistributeError(e instanceof Error ? e.message : 'AI 整理失败，请重试或改用逐题填写')
    } finally {
      setDistributing(false)
    }
  }

  /** 撤销上一次分配，把答案还原成分配前的快照（模型分错/覆盖了自己写的内容时用）。 */
  const handleUndoDistribute = () => {
    if (!distributeResult) return
    setAnswers(distributeResult.snapshot)
    setDistributeResult(null)
  }

  const handleSubmit = async () => {
    if (!allAnswered || submitting || uploadingAnswers.size > 0) return
    setSubmitting(true)
    const hist = questions.map((q, i) => ({ question: q.question, answer: answers[i] ?? '' }))
    try {
      await saveQaHistory(sessionId, hist)
      onDone(hist)
    } catch {
      setSubmitting(false)
      onError('保存澄清答案失败，请重试')
    }
  }

  if (generating) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-muted)]/30 px-6 py-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3 text-[var(--color-primary)]" />
          <p className="text-sm text-[var(--color-foreground)] font-medium mb-1">Claude 正在一次性生成全部澄清问题…</p>
          <p className="text-xs text-[var(--color-muted-foreground)]">结合代码/业务知识图谱生成，约 10-30 秒</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 进度条 */}
      <div className="flex items-center gap-3 px-5 py-2 border-b border-[var(--color-border)] bg-[var(--color-card)]">
        <span className="text-xs text-[var(--color-muted-foreground)]">
          批量澄清：已填 {answeredCount} / {questions.length} 题
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-[var(--color-muted)]">
          <div
            className="h-full rounded-full bg-[var(--color-primary)] transition-all"
            style={{ width: `${questions.length ? Math.round((answeredCount / questions.length) * 100) : 0}%` }}
          />
        </div>
      </div>

      {/* 逐字段防抖自动保存失败提示：不阻断继续填写，但要让用户知道进度可能没落库 */}
      {saveError && (
        <div className="px-5 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-500">
          ⚠ {saveError}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 md:px-5">
        <div className="max-w-3xl mx-auto space-y-4">
          {/* ── 一次性回答（默认折叠，逐题作答仍是推荐路径）── */}
          {!bulkOpen ? (
            <button
              type="button"
              onClick={() => setBulkOpen(true)}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted-foreground)] hover:border-[var(--color-ring)] hover:text-[var(--color-foreground)] transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              已经想好了？一次性粘贴回答，AI 自动分配到各题
            </button>
          ) : (
            <div className="rounded-xl border border-[var(--color-primary)]/25 bg-[var(--color-primary)]/5 overflow-hidden">
              <div className="flex items-start justify-between gap-2 px-4 py-2.5 border-b border-[var(--color-primary)]/15">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-primary)]">
                    <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
                    一次性回答（AI 自动分配到各题）
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
                    建议还是逐题回答，针对性更强、不容易漏；这里适合你已经在别处想清楚、只想整段贴进来的情况。
                    AI 只做拆分归位，不会替你编答案，没覆盖到的题会留空等你补。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setBulkOpen(false)}
                  className="flex-shrink-0 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                  title="收起"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={5}
                placeholder={`把对上面 ${questions.length} 题的回答一起写在这里，可以带题号也可以不带，例如：\n1. 超时就强制退出，当前记录会自动存草稿\n导出用 xlsx，管理员能看全部人的记录`}
                className="w-full px-4 py-2.5 text-sm resize-y focus:outline-none bg-[var(--color-input)]"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-[11px] text-[var(--color-muted-foreground)]">
                  分配后仍可逐题修改，不满意可一键撤销
                </span>
                <button
                  type="button"
                  disabled={!bulkText.trim() || distributing}
                  onClick={handleDistribute}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[var(--color-primary)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-40"
                >
                  {distributing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {distributing ? 'AI 整理中…' : 'AI 自动分配到各题'}
                </button>
              </div>

              {distributeError && (
                <div className="px-4 pb-2.5 text-[11px] text-red-500">⚠ {distributeError}</div>
              )}

              {distributeResult && (
                <div className="mx-4 mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-2 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                    <span className="font-medium text-[var(--color-foreground)]">
                      已分配 {distributeResult.matchedCount} / {distributeResult.total} 题
                    </span>
                    {distributeResult.unmatchedNumbers.length > 0 && (
                      <span className="text-amber-500">
                        第 {distributeResult.unmatchedNumbers.join('、')} 题没匹配到内容，请手动补充
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleUndoDistribute}
                      className="ml-auto underline text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                    >
                      撤销分配
                    </button>
                  </div>
                  {/* 没归到任何一题的内容原样展示，避免用户粘贴的内容被静默吞掉 */}
                  {distributeResult.leftover && (
                    <div className="text-[11px] text-[var(--color-muted-foreground)]">
                      <span className="text-amber-500">未归类内容：</span>
                      <span className="whitespace-pre-wrap break-words">{distributeResult.leftover}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {questions.map((q, i) => (
            <div key={i} className="rounded-xl border border-[var(--color-border)] overflow-hidden">
              <div className="flex items-start gap-2.5 px-4 py-3 bg-[var(--color-muted)]/30">
                <div className="w-5 h-5 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0 text-[10px] font-semibold text-[var(--color-primary)] mt-0.5">
                  {i + 1}
                </div>
                <p className="text-sm leading-relaxed">{q.question}</p>
              </div>
              <ClarificationAnswerComposer
                value={answers[i] ?? ''}
                onChange={(value) => setAnswers((prev) => prev.map((answer, j) => (j === i ? value : answer)))}
                onBlur={flushSaveNow}
                rows={2}
                placeholder="输入你的回答…"
                embedded
                onUploadingChange={(uploading) => setUploadingAnswers((current) => {
                  const next = new Set(current)
                  if (uploading) next.add(i)
                  else next.delete(i)
                  return next
                })}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
          <p className="text-xs text-[var(--color-muted-foreground)]">
            {allAnswered ? '全部题目已填完，可以提交生成 PRD 了' : `还有 ${questions.length - answeredCount} 题未填`}
          </p>
          <button
            disabled={!allAnswered || submitting || uploadingAnswers.size > 0}
            onClick={handleSubmit}
            className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            提交并生成 PRD
          </button>
        </div>
      </div>
    </div>
  )
}

// ───── 开始开发 Dialog（LaunchIntent → Vibe Coding） ─────
