import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, FileText, Link2, Loader2, RefreshCw, Sparkles, Unlink, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Combobox } from '@/components/ui/combobox'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  analyzeDocChanges,
  getLatestDocChangeCandidate,
  getSessionByDevSession,
  linkDevSession,
  listSessions,
  overrideDocChangeDecision,
  reanalyzeDocChanges,
  startGenerate,
  startGenerateDevDoc,
  unlinkDevSession,
  updateDocChangeStage,
  type DocChangeDecision,
  type PrdDocChangeCandidate,
} from '@/features/prd-clarify/api'
import type { PrdSessionView } from '@/features/prd-clarify/types'

/** 剪贴板写入 + 降级（非安全上下文/旧浏览器用隐藏 textarea + execCommand）。 */
async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch { /* 忽略 */ }
    document.body.removeChild(ta)
  }
}

interface Props {
  /** 当前 Vibe Coding 会话 id（即 claude-chat 的 chat.sessionId）。 */
  sessionId: string
  onClose: () => void
  /** 绑定状态变化时通知外层——顶栏那个 PRD 标识要跟着刷新，不用外层自己再查一遍。 */
  onLinkedChange?: (linked: PrdSessionView | null) => void
}

const DECISION_LABELS: Record<DocChangeDecision, string> = {
  NONE: '无需更新',
  PRD_ONLY: '只更新 PRD',
  TDD_ONLY: '只更新 TDD',
  BOTH: 'PRD + TDD',
  UNCERTAIN: '需要确认',
}

const DECISION_OPTIONS: DocChangeDecision[] = ['NONE', 'PRD_ONLY', 'TDD_ONLY', 'BOTH', 'UNCERTAIN']

/**
 * 「关联 PRD」面板：展示/建立/更换 当前会话与 PRD 澄清助手某条记录的绑定，绑定后可以
 * 复制文档路径、一键把这次会话的改动同步进 PRD + 开发文档(TDD)。
 *
 * 绑定关系本身早就有（`prd_session.dev_session_id`，PRD 页面「开始开发」跳过来时会自动建立），
 * 这个面板补的是缺的那部分：(1) 反过来查"我这个会话绑没绑"、在聊天窗口露出标识；
 * (2) 让已经开着、不是走自动握手流程创建的会话也能手动搜索绑定一个 PRD；
 * (3) 复制 PRD/开发文档的文件路径，方便贴进对话或终端引用；
 * (4) 「一键更新 PRD + 开发文档」——复用 PRD 澄清助手现成的 AI 增量更新生成流程：PRD 走
 * 「生成修订版」同一套 prompt（原地覆盖同一份文件，不新建会话），开发文档走已有的增量更新，
 * 旧版本都自动备份进历史。
 */
export function PrdLinkPanel({ sessionId, onClose, onLinkedChange }: Props) {
  const navigate = useNavigate()
  const confirm = useConfirm()
  // undefined=加载中，null=确认未绑定，PrdSessionView=已绑定
  const [linked, setLinked] = useState<PrdSessionView | null | undefined>(undefined)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [unlinking, setUnlinking] = useState(false)
  const [unlinkErr, setUnlinkErr] = useState<string | null>(null)

  const refresh = () => {
    setLoadErr(null)
    getSessionByDevSession(sessionId)
      .then(v => { setLinked(v); onLinkedChange?.(v) })
      .catch(e => setLoadErr(e instanceof Error ? e.message : String(e)))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [sessionId])

  // ── 搜索绑定 ──────────────────────────────────────────────────────────────
  const [picking, setPicking] = useState(false)
  const [candidates, setCandidates] = useState<PrdSessionView[]>([])
  const [pickValue, setPickValue] = useState('')
  const [linking, setLinking] = useState(false)
  const [linkErr, setLinkErr] = useState<string | null>(null)

  useEffect(() => {
    if (!picking) return
    listSessions().then(setCandidates).catch(() => setCandidates([]))
  }, [picking])

  const options = useMemo(
    () => candidates.map(s => ({ value: s.id, label: `${s.title || '（未命名）'}${s.project ? ` · ${s.project}` : ''}${s.module ? `/${s.module}` : ''}` })),
    [candidates],
  )

  const doLink = async () => {
    const target = candidates.find(s => s.id === pickValue || s.title === pickValue)
    if (!target) { setLinkErr('请从下拉列表里选一个已有的 PRD，不支持手填新建'); return }
    setLinking(true)
    setLinkErr(null)
    try {
      await linkDevSession(target.id, sessionId)
      setPicking(false)
      setPickValue('')
      refresh()
    } catch (e) {
      setLinkErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLinking(false)
    }
  }

  // ── 取消关联 ──────────────────────────────────────────────────────────────
  const doUnlink = async () => {
    if (!linked) return
    const ok = await confirm({
      title: '取消关联',
      description: `确认取消与「${linked.title || '（未命名）'}」的关联？取消后聊天窗口不再显示 PRD 标识，PRD/开发文档本身不受影响，可以随时重新关联。`,
      confirmText: '取消关联',
      variant: 'destructive',
    })
    if (!ok) return
    setUnlinking(true)
    setUnlinkErr(null)
    try {
      await unlinkDevSession(linked.id)
      refresh()
    } catch (e) {
      setUnlinkErr(e instanceof Error ? e.message : String(e))
    } finally {
      setUnlinking(false)
    }
  }

  // ── 复制文档路径：绑定后经常要在别处（终端、跟 Claude 说"看看这个文件"）引用这两份文件，
  // 省得跑去 PRD 澄清助手里找路径再复制。 ──────────────────────────────────────
  const [pathCopied, setPathCopied] = useState(false)
  const doCopyPaths = async () => {
    if (!linked) return
    const text = [
      `PRD：${linked.mdPath || '（尚未生成）'}`,
      `开发文档（TDD）：${linked.devDocPath || '（尚未生成）'}`,
    ].join('\n')
    await copyTextToClipboard(text)
    setPathCopied(true)
    setTimeout(() => setPathCopied(false), 1500)
  }

  // ── AI 变更候选：先分析对话 + Git，再由用户确认更新范围。正式文档生成仍复用原接口。 ──
  const [candidate, setCandidate] = useState<PrdDocChangeCandidate | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisErr, setAnalysisErr] = useState<string | null>(null)
  const [decisionSaving, setDecisionSaving] = useState(false)
  const [clarificationAnswer, setClarificationAnswer] = useState('')
  const [reanalyzing, setReanalyzing] = useState(false)
  const [note, setNote] = useState('')
  const [updateStage, setUpdateStage] = useState<'prd' | 'devdoc' | null>(null)
  const [updateErr, setUpdateErr] = useState<string | null>(null)
  const updating = updateStage !== null || analyzing || reanalyzing || decisionSaving

  useEffect(() => {
    if (!linked) {
      setCandidate(null)
      return
    }
    let alive = true
    getLatestDocChangeCandidate(linked.id)
      .then(value => { if (alive) setCandidate(value ?? null) })
      .catch(() => { /* 候选恢复失败不影响 PRD 绑定和路径操作 */ })
    return () => { alive = false }
  }, [linked?.id])

  const doAnalyze = async () => {
    if (!linked) return
    setAnalyzing(true)
    setAnalysisErr(null)
    setUpdateErr(null)
    try {
      setCandidate(await analyzeDocChanges(linked.id))
    } catch (e) {
      setAnalysisErr(e instanceof Error ? e.message : String(e))
    } finally {
      setAnalyzing(false)
    }
  }

  const doOverrideDecision = async (decision: DocChangeDecision) => {
    if (!candidate || decision === candidate.decision) return
    setDecisionSaving(true)
    setAnalysisErr(null)
    try {
      setCandidate(await overrideDocChangeDecision(candidate.id, decision))
    } catch (e) {
      setAnalysisErr(e instanceof Error ? e.message : String(e))
    } finally {
      setDecisionSaving(false)
    }
  }

  const doReanalyze = async () => {
    if (!candidate || !clarificationAnswer.trim()) return
    setReanalyzing(true)
    setAnalysisErr(null)
    try {
      setCandidate(await reanalyzeDocChanges(candidate.id, clarificationAnswer.trim()))
      setClarificationAnswer('')
    } catch (e) {
      setAnalysisErr(e instanceof Error ? e.message : String(e))
    } finally {
      setReanalyzing(false)
    }
  }

  const runGeneratePrd = (id: string, n: string) => new Promise<void>((resolve, reject) => {
    startGenerate(id, {
      onEvent(name, data) {
        if (name === 'done') resolve()
        else if (name === 'error') {
          const msg = data && typeof data === 'object' && 'message' in data ? String((data as { message: unknown }).message) : 'PRD 更新失败'
          reject(new Error(msg))
        }
      },
      onError(err) { reject(err instanceof Error ? err : new Error(String(err))) },
    }, n || undefined, true)
  })

  const runGenerateDevDoc = (id: string, n: string) => new Promise<void>((resolve, reject) => {
    // 此入口只有用户确认 AI 文档变更候选后才会执行，候选核对即本次 TDD 更新澄清关卡。
    startGenerateDevDoc(id, n || undefined, true, undefined, true, {
      onEvent(name, data) {
        if (name === 'done') resolve()
        else if (name === 'error') {
          const msg = data && typeof data === 'object' && 'message' in data ? String((data as { message: unknown }).message) : '开发文档更新失败'
          reject(new Error(msg))
        }
      },
      onError(err) { reject(err instanceof Error ? err : new Error(String(err))) },
    })
  })

  const buildUpdateNote = (value: PrdDocChangeCandidate) => {
    const lines = [
      value.summary,
      value.reasoning ? `判断理由：${value.reasoning}` : '',
      value.prdPatchPlan.length > 0 ? `PRD 拟修改章节：${value.prdPatchPlan.join('；')}` : '',
      value.tddPatchPlan.length > 0 ? `TDD 拟修改章节：${value.tddPatchPlan.join('；')}` : '',
      value.evidence.length > 0 ? `事实证据：${value.evidence.join('；')}` : '',
      note.trim() ? `用户补充：${note.trim()}` : '',
    ]
    return lines.filter(Boolean).join('\n')
  }

  const runConfirmedUpdate = async () => {
    if (!linked || !candidate) return
    const decision = candidate.decision
    if (decision === 'NONE') {
      setCandidate(await updateDocChangeStage(candidate.id, 'NO_UPDATE'))
      return
    }
    if (decision === 'UNCERTAIN') {
      setUpdateErr('仍有未决问题，请先补充信息或人工调整更新范围')
      return
    }
    setUpdateErr(null)
    const n = buildUpdateNote(candidate)
    let current = candidate
    try {
      if (current.status === 'PENDING') {
        current = await updateDocChangeStage(current.id, 'CONFIRM')
        setCandidate(current)
      }

      // PARTIAL/TDD 或已有 prdAppliedAt 的 BOTH 候选直接从 TDD 续跑，不重复覆盖 PRD。
      const resumeTdd = current.applyStage === 'TDD' && current.prdAppliedAt != null
      if ((decision === 'PRD_ONLY' || decision === 'BOTH') && !resumeTdd) {
        current = await updateDocChangeStage(current.id, 'START_PRD')
        setCandidate(current)
        setUpdateStage('prd')
        await runGeneratePrd(linked.id, n)
        current = await updateDocChangeStage(current.id, decision === 'PRD_ONLY' ? 'PRD_ONLY_SUCCESS' : 'PRD_SUCCESS')
        setCandidate(current)
      }

      if (decision === 'TDD_ONLY' || decision === 'BOTH') {
        current = await updateDocChangeStage(current.id, 'START_TDD')
        setCandidate(current)
        setUpdateStage('devdoc')
        await runGenerateDevDoc(linked.id, n)
        current = await updateDocChangeStage(current.id, 'TDD_SUCCESS')
        setCandidate(current)
      }

      setUpdateStage(null)
      setNote('')
      refresh()
    } catch (e) {
      setUpdateStage(null)
      const message = e instanceof Error ? e.message : String(e)
      setUpdateErr(message)
      try {
        setCandidate(await updateDocChangeStage(current.id, 'FAIL', message))
      } catch {
        // 原始失败优先展示；状态登记失败会在下次打开时由当前阶段反映。
      }
    }
  }

  const doDismiss = async () => {
    if (!candidate) return
    setCandidate(await updateDocChangeStage(candidate.id, 'DISMISS'))
  }

  const openPrd = (prdId: string) => {
    onClose()
    navigate(`/tools/prd-clarify?viewSession=${encodeURIComponent(prdId)}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16" onClick={onClose}>
      <div
        className="flex max-h-[75vh] w-full max-w-md flex-col overflow-hidden rounded-xl border bg-[var(--color-card)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Link2 className="size-4 text-[var(--color-muted-foreground)]" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">关联 PRD</span>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]" aria-label="关闭">
            <X className="size-3.5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {linked === undefined && (
            <div className="flex items-center gap-2 py-6 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="size-4 animate-spin" />加载中…
            </div>
          )}
          {loadErr && (
            <p className="text-xs text-[var(--color-destructive)]">查询绑定状态失败：{loadErr}</p>
          )}

          {linked && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-[var(--color-muted)]/40 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <FileText className="size-3.5 shrink-0 text-[var(--color-primary)]" />
                  <span className="min-w-0 flex-1 truncate">{linked.title || '（未命名）'}</span>
                </div>
                {(linked.project || linked.module) && (
                  <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                    {linked.project}{linked.module ? ` / ${linked.module}` : ''}
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => openPrd(linked.id)}
                    className="flex items-center gap-1 text-xs text-[var(--color-primary)] hover:underline"
                  >
                    <ExternalLink className="size-3" />在 PRD 澄清助手里打开
                  </button>
                  <button
                    type="button"
                    onClick={() => void doCopyPaths()}
                    title="复制 PRD + 开发文档(TDD) 的文件路径，方便贴进对话或终端引用"
                    className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:underline"
                  >
                    {pathCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
                    {pathCopied ? '已复制路径' : '复制文档路径'}
                  </button>
                </div>
              </div>

              <div className="rounded-lg border px-3 py-2.5">
                <div className="mb-1.5 flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-violet-500" />
                  <p className="text-xs font-medium">文档变更分析</p>
                </div>
                <p className="mb-2 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
                  系统会从上次完成同步点采集对话、工具、Git 和文档证据，复用当前开发会话的模型配置完成分析与独立复核。
                  只登记建议，不会修改代码或自动覆盖正式文档。
                </p>

                {!candidate && (
                  <button
                    type="button"
                    onClick={() => void doAnalyze()}
                    disabled={updating}
                    className={cn(
                      'flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90',
                      updating && 'pointer-events-none opacity-60',
                    )}
                  >
                    {analyzing ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    {analyzing ? '正在整理证据并复核…' : '分析本次变更'}
                  </button>
                )}

                {candidate && (
                  <div className="space-y-2.5">
                    <div className="rounded-md border bg-[var(--color-muted)]/30 p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-[var(--color-muted-foreground)]">AI 建议</span>
                        <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300">
                          {DECISION_LABELS[candidate.aiDecision]}
                        </span>
                        <span className="ml-auto text-[11px] text-[var(--color-muted-foreground)]">
                          置信度 {candidate.confidence}%
                        </span>
                      </div>
                      {candidate.summary && <p className="mt-1.5 text-xs leading-relaxed">{candidate.summary}</p>}
                      {candidate.reasoning && (
                        <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
                          {candidate.reasoning}
                        </p>
                      )}
                    </div>

                    <label className="block text-[11px] text-[var(--color-muted-foreground)]">
                      最终更新范围（可人工调整）
                      <select
                        value={candidate.decision}
                        onChange={event => void doOverrideDecision(event.target.value as DocChangeDecision)}
                        disabled={updating || candidate.status === 'APPLYING' || candidate.status === 'APPLIED' || candidate.prdAppliedAt != null || candidate.tddAppliedAt != null}
                        className="mt-1 w-full rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-xs text-[var(--color-foreground)]"
                      >
                        {DECISION_OPTIONS.map(value => (
                          <option key={value} value={value}>{DECISION_LABELS[value]}</option>
                        ))}
                      </select>
                    </label>

                    {candidate.evidence.length > 0 && (
                      <details className="rounded-md border px-2 py-1.5 text-[11px]">
                        <summary className="cursor-pointer font-medium">判断证据（{candidate.evidence.length}）</summary>
                        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[var(--color-muted-foreground)]">
                          {candidate.evidence.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                        </ul>
                      </details>
                    )}

                    {(candidate.prdPatchPlan.length > 0 || candidate.tddPatchPlan.length > 0) && (
                      <details className="rounded-md border px-2 py-1.5 text-[11px]">
                        <summary className="cursor-pointer font-medium">拟修改章节</summary>
                        {candidate.prdPatchPlan.length > 0 && (
                          <p className="mt-1.5 text-[var(--color-muted-foreground)]">PRD：{candidate.prdPatchPlan.join('；')}</p>
                        )}
                        {candidate.tddPatchPlan.length > 0 && (
                          <p className="mt-1 text-[var(--color-muted-foreground)]">TDD：{candidate.tddPatchPlan.join('；')}</p>
                        )}
                      </details>
                    )}

                    {candidate.risks.length > 0 && (
                      <div className="flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
                        <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                        <span>{candidate.risks.join('；')}</span>
                      </div>
                    )}

                    {candidate.decision === 'UNCERTAIN' && (
                      <div className="rounded-md border border-amber-400/60 p-2">
                        <p className="text-xs font-medium">需要补充一个关键信息</p>
                        <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
                          {candidate.clarificationQuestion || '请补充这次最终确认的变化。'}
                        </p>
                        <textarea
                          value={clarificationAnswer}
                          onChange={event => setClarificationAnswer(event.target.value)}
                          rows={2}
                          placeholder="只回答这个阻塞问题；信息充分后 AI 会停止追问"
                          className="mt-2 w-full resize-none rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => void doReanalyze()}
                          disabled={reanalyzing || !clarificationAnswer.trim()}
                          className="mt-1.5 flex w-full items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs hover:bg-[var(--color-accent)] disabled:opacity-50"
                        >
                          {reanalyzing && <Loader2 className="size-3 animate-spin" />}
                          补充并重新分析
                        </button>
                      </div>
                    )}

                    {candidate.decision !== 'NONE' && candidate.decision !== 'UNCERTAIN'
                      && !['APPLIED', 'DISMISSED', 'NO_UPDATE'].includes(candidate.status) && (
                      <textarea
                        value={note}
                        onChange={event => setNote(event.target.value)}
                        disabled={updating}
                        placeholder="（可选）给文档生成器的额外约束；AI 摘要会自动带入"
                        rows={2}
                        className="w-full resize-none rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-xs"
                      />
                    )}

                    {!['APPLIED', 'DISMISSED', 'NO_UPDATE'].includes(candidate.status) && candidate.decision !== 'UNCERTAIN' && (
                      <button
                        type="button"
                        onClick={() => void runConfirmedUpdate()}
                        disabled={updating}
                        className={cn(
                          'flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90',
                          updating && 'pointer-events-none opacity-60',
                        )}
                      >
                        {updateStage ? <Loader2 className="size-3.5 animate-spin" /> : candidate.decision === 'NONE' ? <Check className="size-3.5" /> : <RefreshCw className="size-3.5" />}
                        {updateStage === 'prd'
                          ? '正在更新 PRD…'
                          : updateStage === 'devdoc'
                            ? '正在更新 TDD…'
                            : candidate.status === 'PARTIAL' && candidate.applyStage === 'TDD'
                              ? '继续更新 TDD'
                              : candidate.decision === 'NONE'
                                ? '标记无需更新'
                                : candidate.decision === 'PRD_ONLY'
                                  ? '确认并更新 PRD'
                                  : candidate.decision === 'TDD_ONLY'
                                    ? '确认并更新 TDD'
                                    : '确认并依次更新 PRD + TDD'}
                      </button>
                    )}

                    {candidate.status === 'APPLIED' && (
                      <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" />候选对应的正式文档已全部更新
                      </p>
                    )}
                    {candidate.status === 'NO_UPDATE' && (
                      <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" />已确认本次无需更新正式文档
                      </p>
                    )}
                    {candidate.status === 'PARTIAL' && candidate.lastError && (
                      <p className="text-xs text-[var(--color-destructive)]">
                        上次在 {candidate.applyStage === 'PRD' ? 'PRD' : 'TDD'} 阶段失败：{candidate.lastError}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => void doAnalyze()}
                        disabled={updating}
                        className="text-[11px] text-[var(--color-muted-foreground)] hover:underline disabled:opacity-50"
                      >
                        重新检查最新变化
                      </button>
                      {!['APPLIED', 'DISMISSED', 'NO_UPDATE'].includes(candidate.status) && (
                        <button
                          type="button"
                          onClick={() => void doDismiss()}
                          disabled={updating}
                          className="text-[11px] text-[var(--color-muted-foreground)] hover:underline disabled:opacity-50"
                        >
                          暂不更新
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {analysisErr && <p className="mt-1.5 text-xs text-[var(--color-destructive)]">分析失败：{analysisErr}</p>}
                {updateErr && <p className="mt-1.5 text-xs text-[var(--color-destructive)]">更新失败：{updateErr}</p>}
              </div>

              {!picking ? (
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setPicking(true)}
                    className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] hover:underline"
                  >
                    更换关联的 PRD
                  </button>
                  <button
                    type="button"
                    onClick={doUnlink}
                    disabled={unlinking}
                    className={cn(
                      'flex items-center gap-1 text-xs text-[var(--color-destructive)] hover:underline',
                      unlinking && 'pointer-events-none opacity-60',
                    )}
                  >
                    {unlinking ? <Loader2 className="size-3 animate-spin" /> : <Unlink className="size-3" />}
                    取消关联
                  </button>
                </div>
              ) : (
                renderPicker()
              )}
              {unlinkErr && <p className="text-xs text-[var(--color-destructive)]">取消关联失败：{unlinkErr}</p>}
            </div>
          )}

          {linked === null && !picking && (
            <div className="py-4 text-center">
              <p className="mb-3 text-xs text-[var(--color-muted-foreground)]">当前会话还没有关联 PRD</p>
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90"
              >
                搜索并关联一个 PRD
              </button>
            </div>
          )}
          {linked === null && picking && renderPicker()}
        </div>
      </div>
    </div>
  )

  function renderPicker() {
    return (
      <div className="rounded-lg border px-3 py-2.5">
        <p className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">选择要关联的 PRD</p>
        <Combobox
          value={pickValue}
          onChange={setPickValue}
          options={options}
          placeholder="搜索 PRD 标题…"
          emptyText="没有匹配的 PRD"
          className="mb-2"
        />
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={doLink}
            disabled={linking || !pickValue}
            className={cn(
              'flex-1 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90',
              (linking || !pickValue) && 'pointer-events-none opacity-60',
            )}
          >
            {linking ? '关联中…' : '确认关联'}
          </button>
          <button
            type="button"
            onClick={() => { setPicking(false); setPickValue(''); setLinkErr(null) }}
            className="rounded-md border px-3 py-1.5 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
          >
            取消
          </button>
        </div>
        {linkErr && <p className="mt-1.5 text-xs text-[var(--color-destructive)]">{linkErr}</p>}
      </div>
    )
  }
}
