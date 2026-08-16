import { useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  Loader2,
  X,
} from 'lucide-react'
import { MarkdownContent } from '@/components/markdown/MarkdownContent'
import {
  generateDevDocQuestions,
  getContent,
  getDevDocContent,
  getSession,
  listDevDocVersions,
  saveQaHistory,
  startClarify,
  startClarifyFromDraft,
  startGenerate,
  startGenerateDevDoc,
  documentProfileLabels,
  type PrdSessionView,
  type QaPair,
  type QuestionItem,
} from '@/features/prd-clarify/public-api'
import type { DeliveryRequirement, DeliveryStageKey } from '../types'
import { DraftView, EmptyDocument, GeneratedNotice, QuestionCards, ReadOnlyHistory, StageSummary } from './stages/DeliveryStageViews'
import { GenerationSupplementDialog } from './GenerationSupplementDialog'
import { eventMessage, extractSourceFiles, messageOf, parseTddQuestions } from '../lib/stageDialogUtils'

export { GenerationSupplementDialog } from './GenerationSupplementDialog'

interface Props {
  requirement: DeliveryRequirement
  stage: DeliveryStageKey
  onClose: () => void
  onStartTddGeneration?: (
    sessionId: string,
    history: QaPair[],
    engine: 'claude' | 'codex',
    extraInstructions?: string,
  ) => void
}

export function DeliveryStageDialog({ requirement, stage, onClose, onStartTddGeneration }: Props) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<PrdSessionView | null>(null)
  const [content, setContent] = useState('')
  const [questions, setQuestions] = useState<QuestionItem[]>([])
  const [answers, setAnswers] = useState<string[]>([])
  const [tddHistory, setTddHistory] = useState<QaPair[]>([])
  const [tddQuestions, setTddQuestions] = useState<string[]>([])
  const [tddAnswers, setTddAnswers] = useState<string[]>([])
  const [tddQuestionsReady, setTddQuestionsReady] = useState(false)
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [engine, setEngine] = useState<'claude' | 'codex'>('codex')
  const [engineReady, setEngineReady] = useState(false)
  const [prdSubmitOpen, setPrdSubmitOpen] = useState(false)
  const [tddSubmitOpen, setTddSubmitOpen] = useState(false)
  const abortRef = useRef<(() => void) | null>(null)
  const restartTdd = stage === 'tddClarify' && (
    requirement.stages.tdd.status === 'STALE'
    || requirement.stages.tdd.status === 'ERROR'
    || requirement.stages.tddClarify.status === 'STALE'
    || requirement.stages.tddClarify.status === 'PARTIAL'
    || requirement.stages.tddClarify.status === 'ERROR'
  )
  const labels = documentProfileLabels(requirement.documentProfile)
  const title = stage === 'prdDraft'
    ? labels.specificationDraft
    : stage === 'prdClarify'
      ? labels.specificationClarify
      : stage === 'prd'
        ? labels.specificationDocument
        : stage === 'tddClarify'
          ? labels.planClarify
          : stage === 'tdd'
            ? labels.planDocument
            : stage === 'code'
              ? '代码开发'
              : stage === 'test'
                ? '测试验证'
                : '运行态'

  const reloadOverview = () => queryClient.invalidateQueries({ queryKey: ['delivery-overview'] })

  useEffect(() => {
    let active = true
    setBusy('正在读取交付数据')
    getSession(requirement.id)
      .then(async loaded => {
        if (!active) return
        setSession(loaded)
        setEngine(loaded.engine === 'claude' ? 'claude' : 'codex')
        setQuestions(loaded.questions ?? [])
        setAnswers((loaded.questions ?? []).map(item => item.answer ?? ''))
        const savedTddAnswers = loaded.devDocQaDraft ?? []
        if (stage === 'tddClarify' && (restartTdd || !loaded.devDocPath) && savedTddAnswers.length > 0) {
          setTddQuestions(savedTddAnswers.map(item => item.question))
          setTddAnswers(savedTddAnswers.map(item => item.answer))
          setTddQuestionsReady(true)
        }

        if ((stage === 'prd' || stage === 'prdClarify') && loaded.mdPath) {
          setContent(await getContent(loaded.id))
        }
        if ((stage === 'tdd' || stage === 'tddClarify') && loaded.devDocPath && !restartTdd) {
          setContent(await getDevDocContent(loaded.id))
        }
        if (stage === 'tddClarify' && loaded.devDocPath && !restartTdd) {
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
  }, [requirement.id, stage, restartTdd])

  useEffect(() => {
    if (!session || busy || error) return
    if (stage === 'prdClarify' && session.questions.length === 0 && session.status !== 'DONE') {
      if (!engineReady) return
      void preparePrdQuestions(session)
    }
    if (
      stage === 'tddClarify'
      && session.status === 'DONE'
      && (restartTdd || !session.devDocPath)
      && tddHistory.length === 0
      && !tddQuestionsReady
    ) {
      if (!engineReady) return
      askTddQuestions(session)
    }
    // 会话先落入状态，再结束初始读取；busy 变为空时才真正启动澄清。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, busy, error, engineReady, restartTdd, tddHistory.length, tddQuestionsReady])

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
          engine,
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
      }, engine)
    } catch (cause) {
      setBusy('')
      setError(messageOf(cause, `无法启动${labels.specificationClarify}`))
    }
  }

  const submitPrdClarification = () => {
    if (!session || questions.length === 0 || answers.some(answer => !answer.trim())) return
    setPrdSubmitOpen(true)
  }

  const confirmPrdClarification = async (extraInstructions: string) => {
    if (!session || questions.length === 0 || answers.some(answer => !answer.trim())) return
    const history = questions.map((item, index) => ({
      question: item.question,
      answer: answers[index].trim(),
    }))
    setPrdSubmitOpen(false)
    setError('')
    setBusy(`正在保存答案并生成${labels.specification}`)
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
            setError(eventMessage(data, `${labels.specification}生成失败`))
          }
        },
        onError: cause => {
          setBusy('')
          setError(messageOf(cause, `${labels.specification}生成连接失败`))
        },
      }, extraInstructions || undefined, false, engine)
    } catch (cause) {
      setBusy('')
      setError(messageOf(cause, '澄清答案保存失败'))
    }
  }

  const askTddQuestions = (loaded: PrdSessionView) => {
    setBusy(`AI 正在结合${labels.specification}、代码和知识图谱批量生成问题`)
    setError('')
    let raw = ''
    abortRef.current = generateDevDocQuestions(
      loaded.id,
      '',
      'initial',
      {
        onEvent(name, data) {
          if (name === 'chunk') {
            raw += (data as { content?: string }).content ?? ''
          } else if (name === 'done') {
            try {
              const batch = parseTddQuestions(raw)
              setTddQuestions(batch)
              setTddAnswers(batch.map(() => ''))
              setTddQuestionsReady(true)
              if (batch.length === 0) {
                startTddGeneration(loaded, [])
              } else {
                setBusy('')
              }
            } catch (cause) {
              setBusy('')
              setError(messageOf(cause, `${labels.planClarify}问题格式解析失败`))
            }
          } else if (name === 'error') {
            setBusy('')
            setError(eventMessage(data, `${labels.planClarify}问题生成失败`))
          }
        },
        onError: cause => {
          setBusy('')
          setError(messageOf(cause, `${labels.planClarify}连接失败`))
        },
      },
      engine,
    )
  }

  const submitTddClarification = () => {
    if (!session || tddQuestions.length === 0 || tddAnswers.some(answer => !answer.trim())) return
    setTddSubmitOpen(true)
  }

  const confirmTddClarification = (extraInstructions: string) => {
    if (!session || tddQuestions.length === 0 || tddAnswers.some(answer => !answer.trim())) return
    const history = tddQuestions.map((question, index) => ({
      question,
      answer: tddAnswers[index].trim(),
    }))
    setTddHistory(history)
    setTddSubmitOpen(false)
    startTddGeneration(session, history, extraInstructions)
  }

  const startTddGeneration = (loaded: PrdSessionView, history: QaPair[], extraInstructions?: string) => {
    if (onStartTddGeneration) {
      onStartTddGeneration(loaded.id, history, engine, extraInstructions)
      onClose()
      return
    }
    generateTdd(loaded, history, extraInstructions)
  }

  const generateTdd = (loaded: PrdSessionView, history: QaPair[], extraInstructions?: string) => {
    setBusy(`澄清完成，正在后台生成${labels.plan}`)
    setProgress(8)
    let received = 0
    abortRef.current = startGenerateDevDoc(
      loaded.id,
      extraInstructions,
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
            setError(eventMessage(data, `${labels.plan}生成失败`))
          }
        },
        onError: cause => {
          setBusy('')
          setError(messageOf(cause, `${labels.plan}生成连接失败`))
        },
      },
      engine,
    )
  }

  const sourceFiles = useMemo(
    () => extractSourceFiles(session?.rawInput ?? '', session?.businessFields.attachments ?? ''),
    [session],
  )
  const stageView = requirement.stages[stage]
  const needsEngineStart = !!session && (
    (stage === 'prdClarify' && session.questions.length === 0 && session.status !== 'DONE')
    || (stage === 'tddClarify' && session.status === 'DONE' && (restartTdd || !session.devDocPath)
      && tddHistory.length === 0 && !tddQuestionsReady)
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-0 backdrop-blur-sm sm:p-4">
      <div className="flex h-full max-h-none w-full max-w-5xl flex-col overflow-hidden border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl sm:h-auto sm:max-h-[90vh]">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:gap-4 sm:px-5 sm:py-4">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
              {title}
            </div>
            <h2 className="mt-1 text-base font-semibold">{requirement.title}</h2>
            <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">{stageView.note}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="h-4 w-4" />
          </button>
        </header>

        {(stage === 'prdClarify' || stage === 'tddClarify') && session && (
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-muted)]/20 px-4 py-3 sm:px-5">
            <span className="mr-1 text-xs text-[var(--color-muted-foreground)]">执行引擎</span>
            {([['codex', 'Codex'], ['claude', 'Claude Code']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={!!busy || engineReady}
                onClick={() => setEngine(value)}
                className={`border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                  engine === value
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]/40'
                }`}
              >
                {label}
              </button>
            ))}
            {needsEngineStart && !engineReady && (
              <button
                type="button"
                onClick={() => setEngineReady(true)}
                className="ml-auto bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-white"
              >
                使用 {engine === 'codex' ? 'Codex' : 'Claude Code'} 开始
              </button>
            )}
          </div>
        )}

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

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
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
                  submitLabel={`确认答案并生成${labels.specification}`}
                />
              )
          )}
          {stage === 'prd' && (
            content
              ? <MarkdownContent content={content} className="text-[13px]" />
              : <EmptyDocument label={`${labels.specification}尚未生成，请先完成${labels.specificationClarify}。`} />
          )}
          {stage === 'tddClarify' && session && (
            session.devDocPath && !restartTdd && tddHistory.length > 0
              ? <ReadOnlyHistory history={tddHistory} />
              : content
                ? <GeneratedNotice kind="TDD" content={content} />
                : (
                  <div className="space-y-4">
                    <p className="border border-purple-500/20 bg-purple-500/5 p-3 text-xs text-purple-400">
                      AI 会一次生成全部关键技术问题；集中填写并提交后直接生成{labels.plan}。能从代码或知识图谱确认的事实不会重复提问。
                    </p>
                    {tddQuestionsReady && tddQuestions.length > 0 && (
                      <QuestionCards
                        perspective={`以下问题按风险和阻塞程度排序。请一次性完成全部技术决策，提交后直接生成${labels.plan}。`}
                        questions={tddQuestions.map((question, index) => ({ id: index + 1, question, answer: tddAnswers[index] ?? '' }))}
                        answers={tddAnswers}
                        onChange={(index, value) => setTddAnswers(current => current.map((item, i) => i === index ? value : item))}
                        disabled={!!busy}
                        onSubmit={submitTddClarification}
                        submitLabel={`提交全部答案并生成${labels.plan}`}
                      />
                    )}
                  </div>
                )
          )}
          {stage === 'tdd' && (
            content
              ? <MarkdownContent content={content} className="text-[13px]" />
              : <EmptyDocument label={`${labels.plan}尚未生成，请先完成${labels.planClarify}。`} />
          )}
          {(stage === 'code' || stage === 'test' || stage === 'runtime') && (
            <StageSummary requirement={requirement} stage={stage} />
          )}
        </div>
      </div>
      {tddSubmitOpen && (
        <GenerationSupplementDialog
          kind="TDD"
          onClose={() => setTddSubmitOpen(false)}
          onConfirm={confirmTddClarification}
        />
      )}
      {prdSubmitOpen && (
        <GenerationSupplementDialog
          kind="PRD"
          onClose={() => setPrdSubmitOpen(false)}
          onConfirm={extraInstructions => void confirmPrdClarification(extraInstructions)}
        />
      )}
    </div>
  )
}
