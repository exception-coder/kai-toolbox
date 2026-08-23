import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Check, CheckCircle2, Copy, ExternalLink, FileText, Link2, Loader2, RefreshCw, Sparkles, Unlink, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Combobox } from '@/components/ui/combobox'
import { useConfirm } from '@/components/ui/confirm-dialog'
import {
  analyzeDocChanges,
  getDocChangeHistory,
  getLatestDocChangeCandidate,
  getSessionByDevSession,
  linkDevSession,
  listSessions,
  overrideDocChangeDecision,
  reanalyzeDocChanges,
  startBackgroundDocUpdate,
  unlinkDevSession,
  updateDocChangeStage,
  type DocChangeDecision,
  type DocChangeCauseType,
  type PrdDocChangeCandidate,
  type PrdSessionView,
  buildOpenSpecLinkSyncPrompt,
} from '@/features/prd-clarify/public-api'

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
  /** 从需求代码节点进入时的 PRD，会话若因旧版本竞态漏绑，可一键按这个权威 ID 补绑。 */
  suggestedPrdSessionId?: string | null
  onClose: () => void
  /** 绑定状态变化时通知外层——顶栏那个 PRD 标识要跟着刷新，不用外层自己再查一遍。 */
  onLinkedChange?: (linked: PrdSessionView | null) => void
  /** 绑定成功后将 OpenSpec 同步门禁发送或排队到当前开发会话。 */
  onSpecSyncRequested?: (prompt: string) => void
}

const DECISION_LABELS: Record<DocChangeDecision, string> = {
  NONE: '无需更新',
  PRD_ONLY: '只更新核心规格',
  TDD_ONLY: '只更新 TDD',
  BOTH: '核心规格 + 执行计划',
  UNCERTAIN: '需要确认',
}

const DECISION_OPTIONS: DocChangeDecision[] = ['NONE', 'PRD_ONLY', 'TDD_ONLY', 'BOTH', 'UNCERTAIN']

const CHANGE_CAUSE_LABELS: Record<DocChangeCauseType, string> = {
  REQUIREMENT_AMBIGUITY: '原始需求/草稿不明确',
  BUSINESS_CHANGE: '业务规则或范围发生变化',
  TECHNICAL_GAP: '技术方案考虑不足',
  DATA_MODEL_GAP: '库表/数据模型考虑不足',
  IMPLEMENTATION_DISCOVERY: '开发中发现新的事实',
  MIXED: '产品与技术复合原因',
  OTHER: '其他原因',
}

const CHANGE_STATUS_LABELS: Record<PrdDocChangeCandidate['status'], string> = {
  PENDING: '待更新',
  CONFIRMED: '已确认',
  APPLYING: '后台更新中',
  PARTIAL: '更新失败/待恢复',
  APPLIED: '更新完成',
  DISMISSED: '暂不更新',
  NO_UPDATE: '无需更新',
}

const DIFF_STATUS_LABELS: Record<PrdDocChangeCandidate['diffLedger'][number]['status'], string> = {
  MATCHED: '文档与证据一致',
  MISMATCH: '发现冲突',
  PROPOSED: 'AI 建议',
  CONFIRMED: '用户已确认，待落档',
  APPLIED: '已写回，待复核',
  VERIFIED: '复核通过',
  UNRESOLVED: '待用户决策',
  OUT_OF_SCOPE: '本次不处理',
}

const EVIDENCE_LEVEL_LABELS: Record<PrdDocChangeCandidate['diffLedger'][number]['evidenceLevel'], string> = {
  DOCUMENT: '正式文档', CODE: '真实代码', TOOL: '工具读取', USER_CONFIRMED: '用户确认', LLM_PROPOSAL: 'AI 建议',
}

function conclusionLabel(value: 'PASSED' | 'FAILED' | 'PENDING') {
  return value === 'PASSED' ? '通过' : value === 'FAILED' ? '未通过' : '待评估'
}

function formatChangeTime(value: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

function plainQuestions(candidate: PrdDocChangeCandidate): string[] {
  const source = candidate.clarificationQuestion?.trim() || ''
  const normalized = source
    .replace(/(?:^|\s)[（(]?(\d+)[）).、]\s*/g, '\n$1. ')
    .replace(/[；;]\s*(?=(?:请|是否|能否|要不要|需不需要|可否))/g, '\n')
  const parsed = normalized.split(/\n+/)
    .map(item => item.replace(/^\s*\d+[.、)]\s*/, '').trim())
    .filter(Boolean)

  const ledgerQuestions = candidate.diffLedger
    .filter(item => item.changeKind === 'BUSINESS_DECISION'
      && (item.status === 'UNRESOLVED' || item.status === 'PROPOSED'))
    .map(item => item.proposedChange || item.actualEvidence)
    .map(item => item.replace(/^建议(?:修改|确认)?[：:]?\s*/, '').trim())
    .filter(Boolean)

  const values = parsed.length > 1 ? parsed : ledgerQuestions.length > 0 ? ledgerQuestions : parsed
  return [...new Set(values)].slice(0, 5).map(value => {
    const clean = value
      .replace(/\[(?:CONV|DOC|GIT|TOOL|DIFF|DEC|ANALYSIS)[^\]]*]/gi, '')
      .replace(/^请确认(?:以下[^：:]*[：:])?\s*/, '')
      .trim()
    if (/^[是否能可要需]/.test(clean) || clean.startsWith('要不要')) {
      return `${clean.replace(/[。？?]+$/, '')}？`
    }
    return `是否确认：${clean.replace(/[。？?]+$/, '')}？`
  })
}

const EMPTY_ALIGNMENT: PrdDocChangeCandidate['alignmentConclusion'] = {
  codeFactAlignment: 'PENDING', businessDecisionCompleteness: 'PENDING', documentFiling: 'PENDING',
  implementationGate: 'BLOCKED', total: 0, verified: 0, unresolved: 0,
  codeFactCorrections: 0, confirmedBusinessDecisions: 0, outOfScope: 0, prdFiled: 0, tddFiled: 0,
  finalDocumentVersion: '', summary: '',
}

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
export function PrdLinkPanel({
  sessionId,
  suggestedPrdSessionId,
  onClose,
  onLinkedChange,
  onSpecSyncRequested,
}: Props) {
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

  const linkSuggested = async () => {
    if (!suggestedPrdSessionId || linking) return
    setLinking(true)
    setLinkErr(null)
    try {
      await linkDevSession(suggestedPrdSessionId, sessionId)
      const value = await getSessionByDevSession(sessionId)
      setLinked(value)
      onLinkedChange?.(value)
      if (value) onSpecSyncRequested?.(buildOpenSpecLinkSyncPrompt(value))
    } catch (cause) {
      setLinkErr(cause instanceof Error ? cause.message : '补充关联失败')
    } finally {
      setLinking(false)
    }
  }

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
    if (!target) { setLinkErr('请从下拉列表里选择一份已有规格，不支持手填新建'); return }
    setLinking(true)
    setLinkErr(null)
    try {
      await linkDevSession(target.id, sessionId)
      setPicking(false)
      setPickValue('')
      onSpecSyncRequested?.(buildOpenSpecLinkSyncPrompt(target))
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
      description: `确认取消与「${linked.title || '（未命名）'}」的关联？取消后聊天窗口不再显示规格标识，核心规格和执行计划本身不受影响，可以随时重新关联。`,
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
      `核心规格：${linked.mdPath || '（尚未生成）'}`,
      `开发文档（TDD）：${linked.devDocPath || '（尚未生成）'}`,
    ].join('\n')
    await copyTextToClipboard(text)
    setPathCopied(true)
    setTimeout(() => setPathCopied(false), 1500)
  }

  // ── AI 变更候选：先分析对话 + Git，再由用户确认更新范围。正式文档生成仍复用原接口。 ──
  const [candidate, setCandidate] = useState<PrdDocChangeCandidate | null>(null)
  const [changeHistory, setChangeHistory] = useState<PrdDocChangeCandidate[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisErr, setAnalysisErr] = useState<string | null>(null)
  const [decisionSaving, setDecisionSaving] = useState(false)
  const [clarificationAnswer, setClarificationAnswer] = useState('')
  const [reanalyzing, setReanalyzing] = useState(false)
  const [note, setNote] = useState('')
  const [startingUpdate, setStartingUpdate] = useState(false)
  const [updateErr, setUpdateErr] = useState<string | null>(null)
  const [docEngine, setDocEngine] = useState<'claude' | 'codex'>('claude')
  const updating = startingUpdate || candidate?.status === 'APPLYING' || analyzing || reanalyzing || decisionSaving
  const diffLedger = candidate?.diffLedger ?? []
  const alignment = candidate?.alignmentConclusion ?? EMPTY_ALIGNMENT
  const clarificationQuestions = candidate ? plainQuestions(candidate) : []

  const rememberCandidate = (value: PrdDocChangeCandidate) => {
    setCandidate(value)
    setChangeHistory(previous => [value, ...previous.filter(item => item.id !== value.id)]
      .sort((a, b) => b.createdAt - a.createdAt))
  }

  useEffect(() => {
    if (linked) setDocEngine(linked.engine === 'codex' ? 'codex' : 'claude')
  }, [linked?.id, linked?.engine])

  useEffect(() => {
    if (!linked) {
      setCandidate(null)
      setChangeHistory([])
      return
    }
    let alive = true
    Promise.all([getLatestDocChangeCandidate(linked.id), getDocChangeHistory(linked.id)])
      .then(([latest, history]) => {
        if (!alive) return
        setCandidate(latest ?? null)
        setChangeHistory(history)
      })
      .catch(() => { /* 候选恢复失败不影响 PRD 绑定和路径操作 */ })
    return () => { alive = false }
  }, [linked?.id])

  const doAnalyze = async () => {
    if (!linked) return
    setAnalyzing(true)
    setAnalysisErr(null)
    setUpdateErr(null)
    try {
      rememberCandidate(await analyzeDocChanges(linked.id))
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
      rememberCandidate(await overrideDocChangeDecision(candidate.id, decision))
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
      rememberCandidate(await reanalyzeDocChanges(candidate.id, clarificationAnswer.trim()))
      setClarificationAnswer('')
    } catch (e) {
      setAnalysisErr(e instanceof Error ? e.message : String(e))
    } finally {
      setReanalyzing(false)
    }
  }

  const runConfirmedUpdate = async () => {
    if (!candidate) return
    const decision = candidate.decision
    if (decision === 'NONE') {
      rememberCandidate(await updateDocChangeStage(candidate.id, 'NO_UPDATE'))
      return
    }
    if (decision === 'UNCERTAIN') {
      setUpdateErr('仍有未决问题，请先补充信息或人工调整更新范围')
      return
    }
    setStartingUpdate(true)
    setUpdateErr(null)
    try {
      rememberCandidate(await startBackgroundDocUpdate(candidate.id, docEngine, note.trim() || undefined))
      setNote('')
    } catch (e) {
      setUpdateErr(e instanceof Error ? e.message : String(e))
    } finally {
      setStartingUpdate(false)
    }
  }

  useEffect(() => {
    if (!linked || (candidate?.status !== 'APPLYING'
      && !(candidate?.status === 'APPLIED' && candidate.verifiedAt == null && !candidate.lastError))) return
    const timer = window.setInterval(() => {
      getLatestDocChangeCandidate(linked.id).then(value => {
        if (value) rememberCandidate(value)
      }).catch(() => { /* 后台任务不依赖轮询连接；下次轮询继续恢复。 */ })
    }, 2_000)
    return () => window.clearInterval(timer)
  }, [linked?.id, candidate?.status, candidate?.verifiedAt])

  const doDismiss = async () => {
    if (!candidate) return
    rememberCandidate(await updateDocChangeStage(candidate.id, 'DISMISS'))
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
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">关联规格</span>
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
                    <ExternalLink className="size-3" />在规格探索中打开
                  </button>
                  <button
                    type="button"
                    onClick={() => void doCopyPaths()}
                    title="复制核心规格和执行计划的文件路径，方便贴进对话或终端引用"
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
                  系统会读取最新核心规格、执行计划、真实代码、工具证据、用户确认及上次差异账本，复用当前会话引擎汇总增量差异。
                  分析只生成变更集，不代表正式文档已经更新。
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
                    {analyzing ? '正在汇总证据与差异…' : '生成本次差异账本'}
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
                        <details className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
                          <summary className="cursor-pointer">查看 AI 判断说明</summary>
                          <p className="mt-1 leading-relaxed">{candidate.reasoning}</p>
                        </details>
                      )}
                    </div>

                    {diffLedger.length > 0 && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                          {([
                            ['代码事实对齐', alignment.codeFactAlignment],
                            ['业务决策完整性', alignment.businessDecisionCompleteness],
                            ['正式文档落档', alignment.documentFiling],
                          ] as const).map(([label, value]) => (
                            <div key={label} className="rounded-md border bg-[var(--color-background)] px-2 py-1.5">
                              <p className="text-[10px] text-[var(--color-muted-foreground)]">{label}</p>
                              <p className={cn('mt-0.5 text-xs font-medium', value === 'PASSED'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : value === 'FAILED' ? 'text-red-600 dark:text-red-400' : 'text-amber-600')}>
                                {conclusionLabel(value)}
                              </p>
                            </div>
                          ))}
                        </div>
                        <div className={cn(
                          'flex items-center justify-between rounded-md border px-2.5 py-2 text-xs font-medium',
                          alignment.implementationGate === 'ALLOWED'
                            ? 'border-emerald-400/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-red-400/60 bg-red-500/10 text-red-700 dark:text-red-300',
                        )}>
                          <span>实施准入</span>
                          <span>{alignment.implementationGate === 'ALLOWED' ? '允许进入 Phase 5' : 'Phase 4 补充中，禁止进入 Phase 5'}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md bg-[var(--color-muted)]/25 px-2.5 py-2 text-[10px] text-[var(--color-muted-foreground)] sm:grid-cols-3">
                          <span>新增差异：{alignment.total} 项</span>
                          <span>代码事实：{alignment.codeFactCorrections} 项</span>
                          <span>业务确认：{alignment.confirmedBusinessDecisions} 项</span>
                          <span>排除范围：{alignment.outOfScope} 项</span>
                          <span>已落档核心规格：{alignment.prdFiled} 项</span>
                          <span>已落档 TDD：{alignment.tddFiled} 项</span>
                          <span>未解决：{alignment.unresolved} 项</span>
                          {alignment.finalDocumentVersion && <span className="col-span-2">最终文档：{alignment.finalDocumentVersion}</span>}
                        </div>

                        <details className="rounded-md border px-2 py-1.5 text-[11px]">
                          <summary className="cursor-pointer font-medium">
                            差异账本（{alignment.verified}/{alignment.total} 已复核）
                          </summary>
                          <div className="mt-2 space-y-2">
                            {diffLedger.map(item => (
                              <div key={item.id} className="rounded-md bg-[var(--color-muted)]/35 p-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-mono font-semibold">{item.id}</span>
                                  <span className="rounded bg-[var(--color-background)] px-1 py-0.5 text-[10px]">{item.sourceDocument} · {item.sourceSection || '未指定章节'}</span>
                                  <span className={cn('ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                                    item.status === 'VERIFIED' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                      : item.status === 'UNRESOLVED' || item.status === 'MISMATCH' ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                                        : item.status === 'APPLIED' || item.status === 'CONFIRMED' ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300'
                                          : 'bg-amber-500/10 text-amber-700 dark:text-amber-300')}>
                                    {DIFF_STATUS_LABELS[item.status]}
                                  </span>
                                </div>
                                <div className="mt-1.5 grid gap-1 text-[var(--color-muted-foreground)]">
                                  <p><span className="font-medium text-[var(--color-foreground)]">当前文档：</span>{item.currentDocument || '未记录'}</p>
                                  <p><span className="font-medium text-[var(--color-foreground)]">真实证据：</span>{item.actualEvidence || '未记录'} <span className="opacity-70">（{EVIDENCE_LEVEL_LABELS[item.evidenceLevel] || item.evidenceLevel}）</span></p>
                                  <p><span className="font-medium text-[var(--color-foreground)]">建议修改：</span>{item.proposedChange || '无需修改'}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                    )}

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
                          <p className="mt-1.5 text-[var(--color-muted-foreground)]">核心规格：{candidate.prdPatchPlan.join('；')}</p>
                        )}
                        {candidate.tddPatchPlan.length > 0 && (
                          <p className="mt-1 text-[var(--color-muted-foreground)]">TDD：{candidate.tddPatchPlan.join('；')}</p>
                        )}
                      </details>
                    )}

                    {candidate.risks.length > 0 && (
                      <details className="rounded-md border border-amber-300/60 bg-amber-500/5 px-2 py-1.5 text-[11px]">
                        <summary className="flex cursor-pointer items-center gap-1.5 font-medium text-amber-800 dark:text-amber-200">
                          <AlertTriangle className="size-3 shrink-0" />风险与复核详情（{candidate.risks.length}）
                        </summary>
                        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[var(--color-muted-foreground)]">
                          {candidate.risks.map((risk, index) => <li key={`${index}-${risk}`}>{risk}</li>)}
                        </ol>
                      </details>
                    )}

                    {candidate.decision === 'UNCERTAIN' && (
                      <div className="rounded-md border border-amber-400/60 bg-amber-500/5 p-2.5">
                        <p className="text-xs font-medium">请按编号确认</p>
                        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed">
                          {(clarificationQuestions.length > 0 ? clarificationQuestions : ['这次最终确认的变化是什么？'])
                            .map((question, index) => <li key={`${index}-${question}`}>{question}</li>)}
                        </ol>
                        <textarea
                          value={clarificationAnswer}
                          onChange={event => setClarificationAnswer(event.target.value)}
                          rows={3}
                          placeholder={'请按编号回答，例如：\n1. 是，按整单保存\n2. 否，本期不包含 App 入口'}
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

                    {candidate.decision !== 'NONE' && candidate.decision !== 'UNCERTAIN' && (
                      <div className="space-y-2 rounded-md border border-violet-300/70 bg-violet-500/5 p-2.5">
                        <p className="text-xs font-medium">变更闭环</p>
                        <div className="rounded-md border bg-[var(--color-background)] px-2.5 py-2">
                          <p className="text-[11px] font-medium text-violet-700 dark:text-violet-300">{CHANGE_CAUSE_LABELS[candidate.changeCauseType || 'OTHER']}</p>
                          <details className="mt-1 text-xs">
                            <summary className="cursor-pointer text-[var(--color-muted-foreground)]">查看变更原因详情</summary>
                            <p className="mt-1 leading-relaxed">{candidate.changeCauseDetail || candidate.reasoning || candidate.summary}</p>
                          </details>
                        </div>
                        {!['APPLIED', 'DISMISSED', 'NO_UPDATE'].includes(candidate.status) && (
                          <textarea value={note} onChange={event => setNote(event.target.value)} disabled={updating} placeholder="（可选）给文档生成器的额外约束" rows={2} className="w-full resize-none rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-xs" />
                        )}
                      </div>
                    )}

                    {!['APPLIED', 'DISMISSED', 'NO_UPDATE'].includes(candidate.status) && candidate.decision !== 'UNCERTAIN' && (
                      <div className="space-y-2">
                        {candidate.decision !== 'NONE' && diffLedger.length === 0 && (
                          <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
                            这是旧版分析记录，尚无可审计差异账本；请先点击“再次分析更新”。
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-1.5">
                          {([['claude', 'Claude Code'], ['codex', 'Codex']] as const).map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              disabled={updating}
                              onClick={() => setDocEngine(value)}
                              className={cn(
                                'rounded-md border px-2 py-1.5 text-[11px] font-medium',
                                docEngine === value
                                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                                  : 'border-[var(--color-border)] text-[var(--color-muted-foreground)]',
                              )}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => void runConfirmedUpdate()}
                          disabled={updating || (candidate.decision !== 'NONE' && diffLedger.length === 0)}
                          className={cn(
                            'flex w-full items-center justify-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90',
                            updating && 'pointer-events-none opacity-60',
                          )}
                        >
                          {updating ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                          {candidate.decision !== 'NONE' && diffLedger.length === 0
                            ? '请先生成差异账本'
                            : candidate.status === 'APPLYING'
                            ? `后台更新中 · ${candidate.applyStage === 'PRD' ? '核心规格' : '执行计划'}`
                            : candidate.status === 'PARTIAL' && candidate.applyStage === 'TDD'
                              ? '后台继续更新 TDD'
                              : candidate.decision === 'NONE'
                                ? '标记无需更新'
                                : candidate.decision === 'PRD_ONLY'
                                  ? '确认差异并后台写回核心规格'
                                  : candidate.decision === 'TDD_ONLY'
                                    ? '确认差异并后台写回 TDD'
                                    : '确认差异并后台写回核心规格 + 执行计划'}
                        </button>
                      </div>
                    )}

                    {candidate.status === 'APPLIED' && (
                      candidate.verifiedAt ? (
                        <p className={cn('flex items-center gap-1 text-xs', alignment.implementationGate === 'ALLOWED'
                          ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                          <CheckCircle2 className="size-3.5" />
                          {alignment.implementationGate === 'ALLOWED'
                            ? '正式文档已写回并通过独立复核'
                            : '正式文档已写回，但仍有未通过的差异项'}
                        </p>
                      ) : candidate.lastError ? (
                        <p className="text-xs text-red-600 dark:text-red-400">正式文档已写回，但独立复核失败：{candidate.lastError}</p>
                      ) : (
                        <p className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                          <Loader2 className="size-3.5 animate-spin" />正式文档已写回，正在重新读取并独立复核…
                        </p>
                      )
                    )}
                    {candidate.status === 'NO_UPDATE' && (
                      <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3.5" />已确认本次无需更新正式文档
                      </p>
                    )}
                    {candidate.status === 'PARTIAL' && candidate.lastError && (
                      <p className="text-xs text-[var(--color-destructive)]">
                        上次在 {candidate.applyStage === 'PRD' ? '核心规格' : '执行计划'}阶段失败：{candidate.lastError}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => void doAnalyze()}
                        disabled={updating}
                        className="flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] font-medium text-[var(--color-foreground)] hover:bg-[var(--color-accent)] disabled:opacity-50"
                      >
                        {analyzing ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                        {analyzing ? '正在重新分析…' : '再次分析更新'}
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

                {changeHistory.length > 0 && (
                  <details className="rounded-md border px-2.5 py-2 text-[11px]">
                    <summary className="cursor-pointer font-medium">规格与执行计划变更历史（{changeHistory.length}）</summary>
                    <div className="mt-2 space-y-2">
                      {changeHistory.map(item => (
                        <div key={item.id} className="rounded-md bg-[var(--color-muted)]/35 p-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium">{DECISION_LABELS[item.decision]}</span>
                            <span className={cn(
                              'rounded-full px-1.5 py-0.5 text-[10px]',
                              item.status === 'APPLIED' || item.status === 'NO_UPDATE'
                                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                                : item.status === 'PARTIAL'
                                  ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                                  : 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
                            )}>
                              {CHANGE_STATUS_LABELS[item.status]}
                            </span>
                            <span className="ml-auto text-[10px] text-[var(--color-muted-foreground)]">
                              {formatChangeTime(item.createdAt)}
                            </span>
                          </div>
                          <p className="mt-1 font-medium text-violet-700 dark:text-violet-300">
                            {CHANGE_CAUSE_LABELS[item.changeCauseType || 'OTHER']}
                          </p>
                          <p className="mt-0.5 leading-relaxed text-[var(--color-muted-foreground)]">
                            {item.changeCauseDetail || item.reasoning || item.summary || '未记录原因说明'}
                          </p>
                          {(item.prdAppliedAt || item.tddAppliedAt) && (
                            <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
                              {item.prdAppliedAt ? `核心规格完成：${formatChangeTime(item.prdAppliedAt)}` : ''}
                              {item.prdAppliedAt && item.tddAppliedAt ? ' · ' : ''}
                              {item.tddAppliedAt ? `TDD 完成：${formatChangeTime(item.tddAppliedAt)}` : ''}
                            </p>
                          )}
                          {item.lastError && <p className="mt-1 text-red-600 dark:text-red-400">失败原因：{item.lastError}</p>}
                          {item.revisionSessionId && item.revisionSessionId !== item.prdSessionId && (
                            <button
                              type="button"
                              onClick={() => openPrd(item.revisionSessionId!)}
                              className="mt-1 inline-flex items-center gap-1 text-[var(--color-primary)] hover:underline"
                            >
                              <ExternalLink className="size-3" />查看关联规格修订版
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
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
                    更换关联规格
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
              <p className="mb-3 text-xs text-[var(--color-muted-foreground)]">当前会话还没有关联规格</p>
              <div className="flex flex-wrap justify-center gap-2">
                {suggestedPrdSessionId && (
                  <button
                    type="button"
                    disabled={linking}
                    onClick={() => void linkSuggested()}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-primary)] px-3 py-1.5 text-xs font-medium text-[var(--color-primary-foreground)] hover:opacity-90 disabled:opacity-60"
                  >
                    {linking ? <Loader2 className="size-3 animate-spin" /> : <Link2 className="size-3" />}
                    关联当前需求的核心规格 / 执行计划
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPicking(true)}
                  className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-muted)]"
                >
                  搜索其他规格
                </button>
              </div>
              {linkErr && <p className="mt-2 text-xs text-[var(--color-destructive)]">关联失败：{linkErr}</p>}
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
        <p className="mb-1.5 text-xs font-medium text-[var(--color-muted-foreground)]">选择要关联的规格</p>
        <Combobox
          value={pickValue}
          onChange={setPickValue}
          options={options}
          placeholder="搜索规格标题…"
          emptyText="没有匹配的规格"
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
