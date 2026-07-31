import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import { Markdown } from '@/features/ai-chat/components/Markdown'
import {
  askNextDevDocQuestion,
  getContent,
  getDevDocContent,
  getSession,
  listDevDocVersions,
  saveQaHistory,
  startClarify,
  startClarifyFromDraft,
  startGenerate,
  startGenerateDevDoc,
} from '@/features/prd-clarify/api'
import type { QaPair } from '@/features/prd-clarify/api'
import type { PrdSessionView, QuestionItem } from '@/features/prd-clarify/types'
import type { DeliveryRequirement, DeliveryStageKey } from '../types'

interface Props {
  requirement: DeliveryRequirement
  stage: DeliveryStageKey
  onClose: () => void
}

const TITLES: Record<DeliveryStageKey, string> = {
  prdDraft: 'PRD 草稿',
  prdClarify: 'PRD 业务澄清',
  prd: 'PRD 文档',
  tddClarify: 'TDD 技术澄清',
  tdd: 'TDD 技术方案',
  code: '代码开发',
  test: '测试验证',
  runtime: '运行态',
}

export function DeliveryStageDialog({ requirement, stage, onClose }: Props) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<PrdSessionView | null>(null)
  const [content, setContent] = useState('')
  const [questions, setQuestions] = useState<QuestionItem[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [tddHistory, setTddHistory] = useState<QaPair[]>([])
  const [currentQuestion, setCurrentQuestion] = useState('')
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const abortRef = useRef<(() => void) | null>(null)
  const questionAccRef = useRef('')

  const reloadOverview = () => queryClient.invalidateQueries({ queryKey: ['delivery-overview'] })

  useEffect(() => {
    let active = true
    setBusy('正在读取交付数据')
    getSession(requirement.id)
      .then(async loaded => {
        if (!active) return
        setSession(loaded)
        setQuestions(loaded.questions ?? [])
        setAnswers((loaded.questions ?? []).map(item => item.answer ?? ''))

        if ((stage === 'prd' || stage === 'prdClarify') && loaded.mdPath) {
          setContent(await getContent(loaded.id))
        }
        if ((stage === 'tdd' || stage === 'tddClarify') && loaded.devDocPath) {
          setContent(await getDevDocContent(loaded.id))
        }
        if (stage === 'tddClarify' && loaded.devDocPath) {
          const versions = await listDevDocVersions(loaded.id)
          const latest = versions.find(item => item.isCurrent) ?? versions.at(-1)
          if (latest?.qaHistory?.length) setTddHistory(latest.qaHistory)
        }
        if (active) setBusy('')
      })
      .catch(cause => {
        if (active) {
          setBusy('')
          setError(messageOf(cause, '交付数据读取失败'))
        }
      })
    return () => {
      active = false
      abortRef.current?.()
    }
  }, [requirement.id, stage])

  useEffect(() => {
    if (!session || busy || error) return
    if (stage === 'prdClarify' && session.questions.length === 0 && session.status !== 'DONE') {
      void preparePrdQuestions(session)
    }
    if (
      stage === 'tddClarify'
      && session.status === 'DONE'
      && !session.devDocPath
      && tddHistory.length === 0
      && !currentQuestion
    ) {
      askTddQuestion(session, 0, [])
    }
    // 会话先落入状态，再结束初始读取；busy 变为空时才真正启动澄清。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, busy, error])

  const preparePrdQuestions = async (loaded: PrdSessionView) => {
    setBusy('AI 正在从业务视角整理必须澄清的问题')
    setError('')
    try {
      let ready = loaded
      if (loaded.status === 'DRAFT') {
        ready = await startClarifyFromDraft(loaded.id, {
          title: loaded.title,
          rawInput: loaded.rawInput ?? '',
          project: loaded.project ?? undefined,
          module: loaded.module ?? undefined,
          engine: loaded.engine,
          role: 'BUSINESS',
          reqType: loaded.reqType,
          maxQuestions: loaded.maxQuestions || 5,
          clarifyMode: 'batch',
          businessFields: loaded.businessFields,
        })
        setSession(ready)
      }
      abortRef.current = startClarify(ready.id, {
        onEvent(name, data) {
          if (name === 'done') {
            getSession(ready.id).then(updated => {
              setSession(updated)
              setQuestions(updated.questions)
              setAnswers(updated.questions.map(item => item.answer ?? ''))
              setBusy('')
            })
          } else if (name === 'error') {
            setBusy('')
            setError(eventMessage(data, '业务澄清问题生成失败'))
          }
        },
        onError: cause => {
          setBusy('')
          setError(messageOf(cause, '业务澄清连接失败'))
        },
      })
    } catch (cause) {
      setBusy('')
      setError(messageOf(cause, '无法启动 PRD 澄清'))
    }
  }

  const submitPrdClarification = async () => {
    if (!session || questions.length === 0 || answers.some(answer => !answer.trim())) return
    const history = questions.map((item, index) => ({
      question: item.question,
      answer: answers[index].trim(),
    }))
    setError('')
    setBusy('正在保存答案并生成 PRD')
    setProgress(8)
    try {
      await saveQaHistory(session.id, history)
      let received = 0
      abortRef.current = startGenerate(session.id, {
        onEvent(name, data) {
          if (name === 'chunk') {
            received += ((data as { content?: string }).content ?? '').length
            setProgress(Math.min(92, 15 + Math.round(received / 120)))
          } else if (name === 'done') {
            Promise.all([getSession(session.id), getContent(session.id)]).then(([updated, markdown]) => {
              setSession(updated)
              setContent(markdown)
              setProgress(100)
              setBusy('')
              void reloadOverview()
            })
          } else if (name === 'error') {
            setBusy('')
            setError(eventMessage(data, 'PRD 生成失败'))
          }
        },
        onError: cause => {
          setBusy('')
          setError(messageOf(cause, 'PRD 生成连接失败'))
        },
      }, undefined, false, session.engine)
    } catch (cause) {
      setBusy('')
      setError(messageOf(cause, '澄清答案保存失败'))
    }
  }

  const askTddQuestion = (loaded: PrdSessionView, index: number, history: QaPair[]) => {
    setBusy('AI 正在结合 PRD、代码和知识图谱分析')
    setCurrentQuestion('')
    questionAccRef.current = ''
    abortRef.current = askNextDevDocQuestion(
      loaded.id,
      index,
      history,
      '',
      'initial',
      {
        onEvent(name, data) {
          if (name === 'chunk') {
            questionAccRef.current += (data as { content?: string }).content ?? ''
            setCurrentQuestion(questionAccRef.current)
          } else if (name === 'done') {
            setBusy('')
            if (questionAccRef.current.includes('[CLARIFICATION_COMPLETE]')) {
              generateTdd(loaded, history)
            }
          } else if (name === 'error') {
            setBusy('')
            setError(eventMessage(data, 'TDD 澄清问题生成失败'))
          }
        },
        onError: cause => {
          setBusy('')
          setError(messageOf(cause, 'TDD 澄清连接失败'))
        },
      },
      loaded.engine,
    )
  }

  const answerTddQuestion = () => {
    if (!session || !currentQuestion.trim() || !currentAnswer.trim()) return
    const next = [...tddHistory, {
      question: currentQuestion.trim(),
      answer: currentAnswer.trim(),
    }]
    setTddHistory(next)
    setCurrentAnswer('')
    askTddQuestion(session, next.length, next)
  }

  const generateTdd = (loaded: PrdSessionView, history: QaPair[]) => {
    setBusy('澄清完成，正在后台生成 TDD')
    setProgress(8)
    let received = 0
    abortRef.current = startGenerateDevDoc(
      loaded.id,
      undefined,
      false,
      history,
      true,
      {
        onEvent(name, data) {
          if (name === 'chunk') {
            received += ((data as { content?: string }).content ?? '').length
            setProgress(Math.min(92, 15 + Math.round(received / 140)))
          } else if (name === 'done') {
            Promise.all([getSession(loaded.id), getDevDocContent(loaded.id)]).then(([updated, markdown]) => {
              setSession(updated)
              setContent(markdown)
              setProgress(100)
              setBusy('')
              void reloadOverview()
            })
          } else if (name === 'error') {
            setBusy('')
            setError(eventMessage(data, 'TDD 生成失败'))
          }
        },
        onError: cause => {
          setBusy('')
          setError(messageOf(cause, 'TDD 生成连接失败'))
        },
      },
      loaded.engine,
    )
  }

  const sourceFiles = useMemo(
    () => extractSourceFiles(session?.rawInput ?? '', session?.businessFields.attachments ?? ''),
    [session],
  )
  const stageView = requirement.stages[stage]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              {TITLES[stage]}
            </div>
            <h2 className="mt-1 text-base font-semibold">{requirement.title}</h2>
            <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">{stageView.note}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="h-4 w-4" />
          </button>
        </header>

        {busy && (
          <div className="border-b border-[var(--color-border)] px-5 py-3">
            <div className="flex items-center gap-2 text-xs text-[var(--color-primary)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />{busy}
            </div>
            {progress > 0 && (
              <div className="mt-2 h-1 overflow-hidden bg-[var(--color-muted)]">
                <div className="h-full bg-[var(--color-primary)] transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 border-b border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-5 py-3 text-xs text-[var(--color-danger)]">
            <AlertCircle className="h-3.5 w-3.5" />{error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {stage === 'prdDraft' && session && (
            <DraftView session={session} sourceFiles={sourceFiles} />
          )}
          {stage === 'prdClarify' && session && (
            session.status === 'DONE'
              ? questions.length > 0
                ? <ReadOnlyHistory history={questions.map((item, index) => ({ question: item.question, answer: answers[index] ?? '' }))} />
                : <GeneratedNotice kind="PRD" content={content} />
              : (
                <QuestionCards
                  perspective="这些问题只核对业务目标、范围、规则与验收口径，不要求业务人员确认技术实现。"
                  questions={questions}
                  answers={answers}
                  onChange={(index, value) => setAnswers(current => current.map((item, i) => i === index ? value : item))}
                  disabled={!!busy}
                  onSubmit={submitPrdClarification}
                  submitLabel="确认答案并生成 PRD"
                />
              )
          )}
          {stage === 'prd' && (
            content
              ? <Markdown text={content} className="text-[13px]" />
              : <EmptyDocument label="PRD 尚未生成，请先完成 PRD 澄清。" />
          )}
          {stage === 'tddClarify' && session && (
            session.devDocPath && tddHistory.length > 0
              ? <ReadOnlyHistory history={tddHistory} />
              : content
                ? <GeneratedNotice kind="TDD" content={content} />
                : (
                  <div className="space-y-4">
                    <p className="border border-purple-500/20 bg-purple-500/5 p-3 text-xs text-purple-400">
                      AI 只询问编码前必须由开发者明确的关键技术决策；能从代码或知识图谱确认的事实不会重复提问。
                    </p>
                    <ReadOnlyHistory history={tddHistory} />
                    {currentQuestion && !currentQuestion.includes('[CLARIFICATION_COMPLETE]') && (
                      <section className="border border-[var(--color-border)] p-4">
                        <div className="flex gap-2">
                          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                          <p className="text-sm font-medium leading-relaxed">{currentQuestion}</p>
                        </div>
                        <textarea
                          value={currentAnswer}
                          onChange={event => setCurrentAnswer(event.target.value)}
                          rows={4}
                          placeholder="填写明确、可执行的技术决策…"
                          className="mt-3 w-full resize-y border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm outline-none focus:border-purple-400"
                        />
                        <button
                          type="button"
                          onClick={answerTddQuestion}
                          disabled={!currentAnswer.trim() || !!busy}
                          className="mt-3 inline-flex items-center gap-1.5 bg-purple-500 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                        >
                          <Send className="h-3 w-3" />提交并继续
                        </button>
                      </section>
                    )}
                  </div>
                )
          )}
          {stage === 'tdd' && (
            content
              ? <Markdown text={content} className="text-[13px]" />
              : <EmptyDocument label="TDD 尚未生成，请先完成 TDD 技术澄清。" />
          )}
          {(stage === 'code' || stage === 'test' || stage === 'runtime') && (
            <StageSummary requirement={requirement} stage={stage} />
          )}
        </div>
      </div>
    </div>
  )
}

function DraftView({ session, sourceFiles }: { session: PrdSessionView; sourceFiles: SourceFile[] }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="space-y-3">
        <h3 className="text-xs font-semibold">原始需求源文件</h3>
        {sourceFiles.length > 0 ? sourceFiles.map(file => (
          <a
            key={`${file.url}-${file.name}`}
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 border border-[var(--color-border)] p-3 text-xs hover:border-[var(--color-primary)]"
          >
            <FileText className="h-4 w-4 text-[var(--color-primary)]" />
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <Download className="h-3.5 w-3.5" />
          </a>
        )) : (
          <p className="text-xs text-[var(--color-muted-foreground)]">本需求通过文本或粘贴图片录入，没有独立源文件。</p>
        )}
        <BusinessFields session={session} />
      </aside>
      <section className="min-w-0 border-l border-[var(--color-border)] pl-5">
        <h3 className="mb-3 text-xs font-semibold">转换后的原始需求 Markdown</h3>
        <Markdown text={session.rawInput || '暂无原始需求内容'} className="text-[13px]" />
      </section>
    </div>
  )
}

function BusinessFields({ session }: { session: PrdSessionView }) {
  const fields = [
    ['需求类型', session.businessFields.businessRequirementType],
    ['需求软件', session.businessFields.requirementSoftware],
    ['发起部门', session.businessFields.initiatingDepartment],
    ['提出人', session.businessFields.requester],
    ['提出日期', session.businessFields.requestedAt],
  ].filter(([, value]) => value)
  if (fields.length === 0) return null
  return (
    <dl className="space-y-2 border-t border-[var(--color-border)] pt-3 text-[10px]">
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[var(--color-muted-foreground)]">{label}</dt>
          <dd className="mt-0.5 text-[var(--color-foreground)]">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function QuestionCards({
  perspective,
  questions,
  answers,
  onChange,
  disabled,
  onSubmit,
  submitLabel,
}: {
  perspective: string
  questions: QuestionItem[]
  answers: string[]
  onChange: (index: number, value: string) => void
  disabled: boolean
  onSubmit: () => void
  submitLabel: string
}) {
  if (questions.length === 0) {
    return <EmptyDocument label="正在等待 AI 输出澄清问题…" />
  }
  const completed = answers.filter(answer => answer.trim()).length
  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-[var(--color-muted-foreground)]">{perspective}</p>
        <span className="shrink-0 text-[10px] text-[var(--color-primary)]">{completed}/{questions.length}</span>
      </div>
      <div className="space-y-3">
        {questions.map((item, index) => (
          <section key={item.id} className="border border-[var(--color-border)] p-4">
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-[10px] font-semibold text-[var(--color-primary)]">
                {index + 1}
              </span>
              <p className="text-sm font-medium leading-relaxed">{item.question}</p>
            </div>
            <textarea
              value={answers[index] ?? ''}
              onChange={event => onChange(index, event.target.value)}
              rows={3}
              disabled={disabled}
              placeholder="请填写明确答案；所有问题完成后才会生成文档。"
              className="mt-3 w-full resize-y border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm outline-none focus:border-[var(--color-primary)] disabled:opacity-60"
            />
          </section>
        ))}
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={disabled || completed !== questions.length}
        className="mt-4 inline-flex items-center gap-1.5 bg-[var(--color-primary)] px-4 py-2 text-xs font-medium text-white disabled:opacity-40"
      >
        <Sparkles className="h-3.5 w-3.5" />{submitLabel}
      </button>
    </div>
  )
}

function ReadOnlyHistory({ history }: { history: QaPair[] }) {
  if (history.length === 0) return null
  return (
    <div className="space-y-3">
      {history.map((item, index) => (
        <section key={`${item.question}-${index}`} className="border border-[var(--color-border)] p-4">
          <p className="text-sm font-medium">{index + 1}. {item.question}</p>
          <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[var(--color-muted-foreground)]">{item.answer}</p>
        </section>
      ))}
    </div>
  )
}

function GeneratedNotice({ kind, content }: { kind: 'PRD' | 'TDD'; content: string }) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-2 border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 p-3 text-xs text-[var(--color-success)]">
        <CheckCircle2 className="h-4 w-4" />澄清已完成，{kind} 已生成。
      </div>
      <Markdown text={content} className="text-[13px]" />
    </div>
  )
}

function StageSummary({
  requirement,
  stage,
}: {
  requirement: DeliveryRequirement
  stage: 'code' | 'test' | 'runtime'
}) {
  const view = requirement.stages[stage]
  return (
    <div className="space-y-4">
      <div className="border border-[var(--color-border)] p-5">
        <div className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">当前状态</div>
        <div className="mt-2 text-xl font-semibold">{view.score == null ? '尚未评估' : `${view.score}%`}</div>
        <p className="mt-2 text-xs leading-relaxed text-[var(--color-muted-foreground)]">{view.note}</p>
      </div>
      {stage === 'code' && requirement.progressItems.completed.length + requirement.progressItems.partial.length + requirement.progressItems.missing.length > 0 && (
        <div className="space-y-2">
          {[...requirement.progressItems.missing, ...requirement.progressItems.partial, ...requirement.progressItems.completed].map((item, index) => (
            <div key={`${item.title}-${index}`} className="border border-[var(--color-border)] p-3">
              <p className="text-xs font-medium">{item.title}</p>
              <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">{item.actual || item.missing || item.implemented}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyDocument({ label }: { label: string }) {
  return (
    <div className="py-20 text-center">
      <FileText className="mx-auto h-6 w-6 text-[var(--color-muted-foreground)]" />
      <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">{label}</p>
    </div>
  )
}

interface SourceFile {
  name: string
  url: string
}

function extractSourceFiles(rawInput: string, attachmentField: string): SourceFile[] {
  const files: SourceFile[] = []
  const markdownLink = /\[([^\]]+)]\((\/api\/prd-clarify\/attachments\/file\/[^)\s]+)\)/g
  for (const source of [rawInput, attachmentField]) {
    let match: RegExpExecArray | null
    while ((match = markdownLink.exec(source)) !== null) {
      files.push({ name: match[1].replace(/^📎\s*/, ''), url: match[2] })
    }
  }
  return files.filter((file, index) => files.findIndex(item => item.url === file.url) === index)
}

function eventMessage(data: unknown, fallback: string) {
  if (typeof data === 'object' && data && 'message' in data) {
    const message = (data as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

function messageOf(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback
}
