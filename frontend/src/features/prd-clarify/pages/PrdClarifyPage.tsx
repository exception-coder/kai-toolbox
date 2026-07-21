import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { BotMessageSquare, Bug, ChevronRight, Code2, Copy, ExternalLink, FileText, GitBranch, Info, Layers, Loader2, Paperclip, Plus, RefreshCw, Rocket, Send, Sparkles, Trash2, User, Wrench, X } from 'lucide-react'
import { http } from '@/lib/api'
import { Combobox } from '@/components/ui/combobox'
import { MultiSelect } from '@/components/ui/multi-select'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
// doc-viewer 的 markdown.css 含完整 prose 样式（标题层级/代码块/表格等），无需 @tailwindcss/typography
import '@/features/doc-viewer/styles/markdown.css'
import {
  askNextDevDocQuestion,
  askNextQuestion,
  autoRegisterToReqPool,
  createSession,
  deleteSession,
  getContent,
  getDevDocContent,
  getDevDocVersionContent,
  checkPrdFile,
  getSession,
  linkPrdToReqItem,
  listDevDocVersions,
  listSessions,
  parseAttachment,
  PRD_CLARIFY_LAUNCH_KEY,
  saveContent,
  saveDevDocContent,
  saveQaHistory,
  startGenerate,
  startGenerateDevDoc,
  type QaPair,
  type AttachmentParseResult,
} from '../api'
import type { DevDocVersionSummary, PrdReqType, PrdSessionView, PrdStep, QuestionItem } from '../types'
import { useConfirm } from '@/components/ui/confirm-dialog'

// 编辑器 lazy import — CodeMirror chunk 只在进入 EDITING 步骤时加载
const MarkdownEditor = lazy(() =>
  import('@/features/doc-viewer/components/MarkdownEditor').then((m) => ({
    default: m.MarkdownEditor,
  }))
)

// ───── Markdown 预览：复用 doc-viewer 的 markdown.css 样式（标题层级/代码块/表格完整渲染） ─────
function MarkdownViewer({ content, viewRef }: { content: string; viewRef?: React.RefObject<HTMLDivElement | null> }) {
  const html = DOMPurify.sanitize(marked.parse(content, { async: false }) as string)
  return (
    <div ref={viewRef} className="h-full overflow-y-auto p-6">
      {/* doc-viewer-md 类由 doc-viewer/styles/markdown.css 定义，包含完整 prose 排版 */}
      <div
        className="doc-viewer-md max-w-none"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

// ───── 大纲侧边栏：从 Markdown 文本提取标题，点击滚动到对应位置 ─────
function DocOutline({
  content,
  targetRef,
}: {
  content: string
  targetRef: React.RefObject<HTMLDivElement | null>
}) {
  const [activeIdx, setActiveIdx] = useState(0)

  // 从 Markdown 文本解析标题列表（h1-h4）
  const headings: Array<{ level: number; text: string }> = []
  for (const line of content.split('\n')) {
    const m = line.match(/^(#{1,4})\s+(.+)/)
    if (m) headings.push({ level: m[1].length, text: m[2].trim() })
  }

  if (headings.length === 0) return null

  const scrollTo = (text: string, idx: number) => {
    setActiveIdx(idx)
    const root = targetRef.current
    if (!root) return
    const els = root.querySelectorAll('h1,h2,h3,h4')
    for (const el of els) {
      if (el.textContent?.trim() === text) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        break
      }
    }
  }

  return (
    <div className="w-48 flex-shrink-0 border-r border-[var(--color-border)] overflow-y-auto py-4 bg-[var(--color-card)]">
      <div className="px-4 mb-3 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
        大纲
      </div>
      {headings.map((h, i) => (
        <button
          key={i}
          onClick={() => scrollTo(h.text, i)}
          className={[
            'w-full text-left py-1 text-xs truncate transition-colors hover:bg-[var(--color-muted)]/50',
            activeIdx === i ? 'text-[var(--color-primary)] font-medium bg-[var(--color-primary)]/8' : 'text-[var(--color-foreground)]',
            h.level === 1 ? 'px-4' : h.level === 2 ? 'pl-6 pr-4 text-[11px]' : h.level === 3 ? 'pl-8 pr-4 text-[11px] text-[var(--color-muted-foreground)]' : 'pl-10 pr-4 text-[10px] text-[var(--color-muted-foreground)]',
          ].join(' ')}
        >
          {h.text}
        </button>
      ))}
    </div>
  )
}

// ───── 步骤指示器 ─────
const STEP_LABELS = ['填写需求', 'AI 渐进澄清', '生成 / 编辑 PRD']
function stepIndex(step: PrdStep): number {
  if (step === 'INPUT') return 0
  if (step === 'CHATTING') return 1
  return 2
}

/**
 * @param onClickStep 若传入，已完成的步骤可点击（用于从第 3 步查看第 2 步澄清记录）
 */
function StepBar({ step, onClickStep }: { step: PrdStep; onClickStep?: (idx: number) => void }) {
  const active = stepIndex(step)
  return (
    <div className="flex items-center gap-2 px-6 py-3 border-b border-[var(--color-border)] bg-[var(--color-card)]">
      {STEP_LABELS.map((label, i) => {
        // 只有步骤 2（i=1，AI渐进澄清）可点击查看历史；步骤 1 回退等于重新开始，不可点
        const clickable = i === 1 && active > 1 && !!onClickStep
        return (
          <div key={label} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => clickable && onClickStep?.(i)}
              disabled={!clickable}
              title={clickable ? `查看${label}` : undefined}
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-opacity
                ${i <= active
                  ? 'bg-[var(--color-primary)] text-white'
                  : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]'}
                ${clickable ? 'cursor-pointer hover:opacity-80 ring-2 ring-[var(--color-primary)]/30' : 'cursor-default'}`}
            >
              {i + 1}
            </button>
            <span
              onClick={() => clickable && onClickStep?.(i)}
              className={`text-sm ${i === active ? 'font-medium' : 'text-[var(--color-muted-foreground)]'} ${clickable ? 'cursor-pointer hover:text-[var(--color-foreground)]' : ''}`}
            >
              {label}
              {clickable && <span className="ml-1 text-[10px] text-[var(--color-primary)] opacity-70">↩</span>}
            </span>
            {i < STEP_LABELS.length - 1 && (
              <ChevronRight className="w-4 h-4 text-[var(--color-muted-foreground)]" />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ───── 澄清记录只读抽屉 ─────
function ClarifyHistorySheet({
  questions,
  onClose,
}: {
  questions: QuestionItem[]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[var(--color-card)] border-l border-[var(--color-border)] flex flex-col shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <BotMessageSquare className="w-4 h-4 text-[var(--color-primary)]" />
            <span className="font-semibold text-sm">PRD 澄清问答记录</span>
            <span className="text-xs text-[var(--color-muted-foreground)]">（共 {questions.length} 题）</span>
          </div>
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {questions.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)] italic">暂无澄清记录</p>
          ) : (
            questions.map((q, i) => (
              <div key={q.id} className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                {/* 问题 */}
                <div className="flex items-start gap-2.5 p-3 bg-[var(--color-muted)]/30">
                  <div className="w-5 h-5 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center flex-shrink-0 text-[10px] font-semibold text-[var(--color-primary)]">
                    {i + 1}
                  </div>
                  <p className="text-sm leading-relaxed">{q.question}</p>
                </div>
                {/* 答案 */}
                <div className="flex items-start gap-2.5 p-3 border-t border-[var(--color-border)]">
                  <User className="w-4 h-4 flex-shrink-0 mt-0.5 text-[var(--color-muted-foreground)]" />
                  <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">
                    {q.answer || <span className="italic">（未填写）</span>}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="px-5 py-3 border-t border-[var(--color-border)] text-xs text-[var(--color-muted-foreground)]">
          此记录已纳入 PRD 生成，关闭后可继续编辑文档。开发文档「更新版本」有自己独立的
          澄清记录，切到开发文档 Tab 后点「本版澄清」单独查看
        </div>
      </div>
    </div>
  )
}

// ───── 开发文档澄清问答记录（跟 PRD 的 ClarifyHistorySheet 视觉对齐，但数据源是
// 当前显示版本自己的 qaHistory，两者完全独立，不会混显） ─────
function DevDocClarifyHistorySheet({
  sessionId,
  onClose,
}: {
  sessionId: string
  onClose: () => void
}) {
  const [version, setVersion] = useState<DevDocVersionSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listDevDocVersions(sessionId)
      .then((list) => {
        if (cancelled) return
        const current = list.find((v) => v.isCurrent) ?? list[0] ?? null
        setVersion(current)
      })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '加载失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [sessionId])

  const qa = version?.qaHistory ?? []

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[var(--color-card)] border-l border-[var(--color-border)] flex flex-col shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <BotMessageSquare className="w-4 h-4 text-purple-400" />
            <span className="font-semibold text-sm">开发文档澄清问答记录</span>
            {version && (
              <span className="text-xs text-[var(--color-muted-foreground)]">
                （v{version.version} · 共 {qa.length} 题）
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="w-4 h-4 animate-spin" /> 加载中…
            </div>
          ) : error ? (
            <p className="text-sm text-red-500">加载失败：{error}</p>
          ) : qa.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)] italic">
              {version?.mode === 'update'
                ? '本版更新时说明已足够明确，未触发追加澄清提问'
                : '当前版本不是通过「更新版本」澄清生成的，没有对应的问答记录'}
            </p>
          ) : (
            qa.map((q, i) => (
              <div key={i} className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                <div className="flex items-start gap-2.5 p-3 bg-[var(--color-muted)]/30">
                  <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 text-[10px] font-semibold text-purple-400">
                    {i + 1}
                  </div>
                  <p className="text-sm leading-relaxed">{q.question}</p>
                </div>
                <div className="flex items-start gap-2.5 p-3 border-t border-[var(--color-border)]">
                  <User className="w-4 h-4 flex-shrink-0 mt-0.5 text-[var(--color-muted-foreground)]" />
                  <p className="text-sm text-[var(--color-muted-foreground)] leading-relaxed">
                    {q.answer || <span className="italic">（未填写）</span>}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="px-5 py-3 border-t border-[var(--color-border)] text-xs text-[var(--color-muted-foreground)]">
          这是当前显示版本（v{version?.version ?? '?'}）自己的澄清记录，跟 PRD 澄清问答记录是
          两份独立数据。其它历史版本各自的澄清记录，在「生成记录」里按版本查看
        </div>
      </div>
    </div>
  )
}

// ───── 生成修订版 Dialog ─────
function ReviseDialog({
  original,
  onConfirm,
  onClose,
}: {
  original: PrdSessionView
  onConfirm: (changeDesc: string) => void
  onClose: () => void
}) {
  const [changeDesc, setChangeDesc] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-sm">生成修订版</span>
          </div>
          <button onClick={onClose}><X className="w-4 h-4 text-[var(--color-muted-foreground)]" /></button>
        </div>
        {/* 原版信息 */}
        <div className="px-5 py-3 bg-amber-500/5 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
            <FileText className="w-3.5 h-3.5" />
            <span>基于：</span>
            <span className="font-medium text-[var(--color-foreground)] truncate">{original.title}</span>
          </div>
          <p className="text-[11px] text-[var(--color-muted-foreground)] mt-1.5 leading-relaxed">
            将基于原 PRD 内容，重新进行 AI 渐进澄清，生成新版本。
            原版内容会作为上下文提供给 Claude，告知这是修订而非全新需求。
          </p>
        </div>
        {/* 修订说明 */}
        <div className="px-5 py-4">
          <label className="block text-sm font-medium mb-2">
            修订说明（可选）
          </label>
          <textarea
            value={changeDesc}
            onChange={e => setChangeDesc(e.target.value)}
            rows={4}
            placeholder="描述本次修订的背景和主要变更点，如：
· 增加了多收货地址功能
· 调整了审批流程：去掉二级审批
· 修正了某业务规则"
            className="w-full px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-input)] text-sm resize-none focus:outline-none focus:ring-1 focus:ring-amber-500/50"
          />
        </div>
        {/* 操作 */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--color-border)]">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
            取消
          </button>
          <button
            onClick={() => onConfirm(changeDesc)}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-amber-500 text-white text-sm font-medium hover:bg-amber-400"
          >
            <GitBranch className="w-3.5 h-3.5" />
            开始修订澄清
          </button>
        </div>
      </div>
    </div>
  )
}

// ───── 原始需求描述弹出卡片 ─────
function RawInputCard({
  session,
  onClose,
}: {
  session: PrdSessionView
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl flex flex-col max-h-[80vh]">
        {/* 头部 */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-[var(--color-primary)] flex-shrink-0" />
              <span className="font-semibold text-sm truncate">{session.title}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(session.project || session.module) && (
                <span className="text-[11px] text-[var(--color-muted-foreground)]">
                  {[session.project, session.module].filter(Boolean).join(' · ')}
                </span>
              )}
              <span className={`text-[9px] px-1.5 py-0.5 rounded border leading-tight ${
                session.role === 'BUSINESS'
                  ? 'bg-green-500/15 text-green-500 border-green-500/20'
                  : 'bg-blue-500/15 text-blue-500 border-blue-500/20'
              }`}>
                {session.role === 'BUSINESS' ? '业务员' : '产品/开发'}
              </span>
              {(() => {
                const cfg = REQ_TYPE_CONFIG[session.reqType ?? 'NEW_MODULE']
                return (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border leading-tight ${cfg.bg} ${cfg.color}`}>
                    {cfg.label}
                  </span>
                )
              })()}
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 原始需求内容 */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-3">
            原始需求描述
          </div>
          {session.rawInput ? (
            <div className="text-sm leading-relaxed text-[var(--color-foreground)] whitespace-pre-wrap bg-[var(--color-muted)]/30 rounded-xl p-4">
              {session.rawInput}
            </div>
          ) : (
            <div className="text-sm text-[var(--color-muted-foreground)] italic">暂无原始需求描述</div>
          )}
        </div>

        {/* 底部信息 */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border)] text-[11px] text-[var(--color-muted-foreground)]">
          <span>创建于 {new Date(session.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          <span className="font-medium">{session.status}</span>
        </div>
      </div>
    </div>
  )
}

// ───── 历史侧边栏 ─────
function HistoryPanel({
  sessions,
  activeId,
  onSelect,
  onDelete,
  onRevise,
}: {
  sessions: PrdSessionView[]
  activeId: string | null
  onSelect: (s: PrdSessionView) => void
  onDelete: (id: string) => void
  onRevise: (s: PrdSessionView) => void
}) {
  const confirm = useConfirm()
  const [previewSession, setPreviewSession] = useState<PrdSessionView | null>(null)

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const ok = await confirm({ title: '删除确认', description: '删除后不可恢复，包括本地 .md 文件。', variant: 'destructive' })
    if (ok) onDelete(id)
  }

  const statusColor: Record<string, string> = {
    DONE: 'text-green-500',
    GENERATING: 'text-blue-500',
    CLARIFYING: 'text-yellow-500',
    ANSWERING: 'text-yellow-500',
    ERROR: 'text-red-500',
  }

  return (
    <>
      {/* 原始需求弹出卡片 */}
      {previewSession && (
        <RawInputCard session={previewSession} onClose={() => setPreviewSession(null)} />
      )}

      <div className="w-56 flex-shrink-0 border-r border-[var(--color-border)] flex flex-col overflow-hidden">
        <div className="px-3 py-2 text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide border-b border-[var(--color-border)]">
          历史记录
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 && (
            <div className="p-3 text-xs text-[var(--color-muted-foreground)]">暂无记录</div>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => onSelect(s)}
              className={`group flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--color-muted)]/40 transition-colors
                ${s.id === activeId ? 'bg-[var(--color-muted)]/60' : ''}`}
            >
              <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[var(--color-muted-foreground)]" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{s.title}</div>
                {/* 项目 / 模块标签 */}
                {(s.project || s.module) && (
                  <div className="text-[10px] text-[var(--color-muted-foreground)] truncate mt-0.5">
                    {[s.project, s.module].filter(Boolean).join(' · ')}
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span className={`text-[10px] ${statusColor[s.status] ?? 'text-[var(--color-muted-foreground)]'}`}>
                    {s.status}
                  </span>
                  {s.role === 'BUSINESS' ? (
                    <span className="text-[9px] px-1 rounded bg-green-500/15 text-green-500 border border-green-500/20 leading-tight">业务</span>
                  ) : (
                    <span className="text-[9px] px-1 rounded bg-blue-500/15 text-blue-500 border border-blue-500/20 leading-tight">产品</span>
                  )}
                  {/* 需求类型标签：跟 REQ_TYPE_CONFIG 配色一致，老数据无 reqType 时按 NEW_MODULE 兜底 */}
                  {(() => {
                    const cfg = REQ_TYPE_CONFIG[s.reqType ?? 'NEW_MODULE']
                    return (
                      <span className={`text-[9px] px-1 rounded border leading-tight ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    )
                  })()}
                </div>

                {/* 树结构：开发文档作为 PRD 的子节点 */}
                {s.devDocPath && (() => {
                  // 过期判断：开发文档生成时间早于 PRD 最后更新时间
                  const isStale = !s.devDocGeneratedAt || s.devDocGeneratedAt < s.updatedAt
                  return (
                    <div className="flex items-center gap-1 mt-1.5">
                      {/* 树连接线 */}
                      <div className="flex-shrink-0" style={{ width: 10, height: 8, borderWidth: '0 0 1px 1px', borderStyle: 'dashed', borderColor: 'rgba(100,100,100,0.3)', borderRadius: '0 0 0 3px' }} />
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onSelect({ ...s, _openDevDoc: true } as PrdSessionView & { _openDevDoc?: boolean })
                        }}
                        className={`flex items-center gap-1 text-[10px] transition-colors ${
                          isStale
                            ? 'text-amber-500 hover:text-amber-400'   // 橙色 = 过期
                            : 'text-purple-400 hover:text-purple-300'  // 紫色 = 已同步
                        }`}
                        title={isStale ? '开发文档已过期（PRD 有更新），建议重新生成' : '查看开发文档（已同步最新PRD）'}
                      >
                        <Wrench className="w-2.5 h-2.5" />
                        {isStale ? '开发文档（已过期）' : '开发文档'}
                      </button>
                      {/* 过期时显示重新生成按钮 */}
                      {isStale && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            // 进入该 PRD 并触发重新生成开发文档
                            onSelect({ ...s, _regenDevDoc: true } as PrdSessionView & { _regenDevDoc?: boolean })
                          }}
                          className="text-[9px] px-1 rounded bg-amber-500/15 text-amber-500 border border-amber-500/20 hover:bg-amber-500/25 leading-tight"
                          title="基于最新 PRD 重新生成开发文档"
                        >
                          ↺ 更新
                        </button>
                      )}
                    </div>
                  )
                })()}
              </div>
              {/* 操作按钮区（hover 显示） */}
              <div className="hidden group-hover:flex items-center gap-1">
                {/* 生成修订版（DONE 状态才显示） */}
                {s.status === 'DONE' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onRevise(s) }}
                    className="text-[var(--color-muted-foreground)] hover:text-amber-500"
                    title="基于此版本生成修订版"
                  >
                    <GitBranch className="w-3 h-3" />
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); setPreviewSession(s) }}
                  className="text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)]"
                  title="查看原始需求"
                >
                  <Info className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => handleDelete(e, s.id)}
                  className="text-[var(--color-muted-foreground)] hover:text-red-500"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ───── 快捷示例模板（围绕需求管理池模块展开） ─────
const QUICK_TEMPLATES = [
  {
    label: 'SLA 预警',
    hint: '知识图谱示例',
    title: '需求池 SLA 剩余天数预警',
    project: 'kai-toolbox',
    module: '需求管理池',
    rawInput: `当需求池中的需求接近截止日期时，系统没有任何提醒机制，
导致产品经理经常遗忘，需求超期后才发现。

期望功能：
- 在需求列表中，距截止日期 ≤3 天的需求自动标红高亮（行级变色）
- 距截止日期 ≤7 天显示黄色警告图标
- 在页面顶部增加"即将超期 N 条"的摘要提示条
- 已完成（DONE）和已取消（CANCELLED）的需求不参与预警
- 超期阈值可在设置中调整（默认 3 天和 7 天）`,
  },
  {
    label: '批量操作',
    hint: '业务逻辑澄清示例',
    title: '需求批量状态变更与分配',
    project: 'kai-toolbox',
    module: '需求管理池',
    rawInput: `产品经理每周会对一批需求做统一操作：
- 将本迭代完成的需求批量标记为 DONE
- 将下迭代的需求批量指派给同一个开发人员
- 将废弃的需求批量取消（状态改为 CANCELLED）

目前只能逐条点击操作，每次迭代结束要手动操作几十条，非常耗时。

期望效果：需求列表支持多选（勾选框），然后可以批量改状态或批量改负责人。`,
  },
  {
    label: '导入Excel',
    hint: '综合示例',
    title: '需求数据导入（Excel/CSV）',
    project: 'kai-toolbox',
    module: '需求管理池',
    rawInput: `我们团队在使用需求管理池之前，已有数百条需求记录存在 Excel 表格中，
列名包括：需求名称、描述、项目、模块、优先级、负责人、截止日期。

期望功能：
1. 支持上传 .xlsx 或 .csv 文件
2. 提供标准导入模板（可下载）
3. 导入前预览：展示将导入的行数、字段映射结果
4. 导入后生成结果报告（成功 N 条/失败 N 条/跳过 N 条）
5. 重复检测：标题完全相同的需求自动跳过（不重复导入）`,
  },
]

// ───── 需求类型配置：与角色正交的第二个维度，决定问什么 + 产出什么结构的文档 + 默认澄清深度 ─────
const REQ_TYPE_CONFIG: Record<PrdReqType, {
  label: string
  icon: typeof Bug
  desc: string
  color: string
  bg: string
  defaultMaxQuestions: number
}> = {
  BUG_FIX: {
    label: 'Bug 修复',
    icon: Bug,
    desc: '复现步骤 + 期望/实际行为落差，通常 1-2 轮就够',
    color: 'text-red-500',
    bg: 'bg-red-500/10 border-red-500/30',
    defaultMaxQuestions: 2,
  },
  MODULE_ADJUST: {
    label: '模块调整',
    icon: Wrench,
    desc: '调整现有功能，问现状/目标/兼容性',
    color: 'text-amber-500',
    bg: 'bg-amber-500/10 border-amber-500/30',
    defaultMaxQuestions: 5,
  },
  NEW_MODULE: {
    label: '新增模块',
    icon: Sparkles,
    desc: '全新功能，问业务目标/场景/边界/验收标准',
    color: 'text-purple-500',
    bg: 'bg-purple-500/10 border-purple-500/30',
    defaultMaxQuestions: 8,
  },
}

/** 澄清深度预设档位（轮数），点选后自定义数字框会同步；用户改数字框后不再随类型自动跳档 */
const DEPTH_PRESETS = [
  { label: '极简', hint: '1-2 轮', value: 2 },
  { label: '标准', hint: '3-5 轮', value: 5 },
  { label: '深入', hint: '6-8 轮', value: 8 },
] as const

/**
 * 「开始澄清」确认弹框：选需求类型 + 调整澄清深度。
 *
 * <p>需求类型决定 Claude 问什么、产出什么结构的文档（后端 PrdClarifyService 按 reqType
 * 切换 system prompt），深度是用户可显式覆盖的最大轮数——不再让 LLM 自己隐式判断该问几轮，
 * 对齐"确定性优先，关键决策不交给 LLM 自由发挥"的原则。
 */
function StartClarifyDialog({
  onConfirm,
  onClose,
}: {
  onConfirm: (reqType: PrdReqType, maxQuestions: number) => void
  onClose: () => void
}) {
  const [reqType, setReqType] = useState<PrdReqType>('NEW_MODULE')
  const [maxQuestions, setMaxQuestions] = useState(REQ_TYPE_CONFIG.NEW_MODULE.defaultMaxQuestions)
  /** 用户是否已手动调整过深度；未调整前，切换需求类型会自动带出该类型的推荐深度 */
  const [depthTouched, setDepthTouched] = useState(false)

  const handleSelectType = (t: PrdReqType) => {
    setReqType(t)
    if (!depthTouched) setMaxQuestions(REQ_TYPE_CONFIG[t].defaultMaxQuestions)
  }

  const handlePickPreset = (value: number) => {
    setMaxQuestions(value)
    setDepthTouched(true)
  }

  const handleCustomInput = (value: number) => {
    setMaxQuestions(Math.max(1, Math.min(10, value || 1)))
    setDepthTouched(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h3 className="font-semibold text-sm">开始澄清前确认</h3>
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-2">这是什么类型的需求？</label>
            <div className="grid grid-cols-1 gap-2">
              {(Object.keys(REQ_TYPE_CONFIG) as PrdReqType[]).map((t) => {
                const cfg = REQ_TYPE_CONFIG[t]
                const active = reqType === t
                const Icon = cfg.icon
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleSelectType(t)}
                    className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      active ? cfg.bg : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]/30'
                    }`}
                  >
                    <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${active ? cfg.color : 'text-[var(--color-muted-foreground)]'}`} />
                    <div>
                      <div className={`text-sm font-semibold ${active ? cfg.color : 'text-[var(--color-foreground)]'}`}>{cfg.label}</div>
                      <div className="text-[11px] text-[var(--color-muted-foreground)] leading-relaxed">{cfg.desc}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-2">
              澄清深度（已按类型预填，可调整）
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {DEPTH_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => handlePickPreset(p.value)}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    maxQuestions === p.value
                      ? 'bg-[var(--color-primary)]/15 border-[var(--color-primary)]/30 text-[var(--color-primary)] font-medium'
                      : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-ring)]'
                  }`}
                >
                  {p.label} {p.hint}
                </button>
              ))}
              <div className="flex items-center gap-1 ml-1">
                <span className="text-xs text-[var(--color-muted-foreground)]">自定义</span>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={maxQuestions}
                  onChange={(e) => handleCustomInput(Number(e.target.value))}
                  className="w-14 px-1.5 py-1 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-xs text-center focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
                />
                <span className="text-xs text-[var(--color-muted-foreground)]">轮</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] hover:bg-[var(--color-muted)]/30"
            >
              取消
            </button>
            <button
              onClick={() => onConfirm(reqType, maxQuestions)}
              className="px-4 py-1.5 rounded-md text-sm bg-[var(--color-primary)] text-white hover:opacity-90"
            >
              开始澄清
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** 常用预设提示词：点击直接追加到文本框（换行分隔），用户也可以完全自由输入。 */
const DEV_DOC_PROMPT_PRESETS = [
  '重点关注可维护性和代码复用，优先复用现有工具类/组件',
  '性能优先，标注关键索引/缓存点',
  '给出详细到方法级别的实现步骤',
  '参考现有代码风格保持一致，不引入新的第三方库',
  '重点设计好数据库表结构和字段类型',
] as const

/** 两种一次性生成场景的文案 + 说明。"更新版本"走多轮澄清，见 DevDocUpdateDialog，不用这个配置。 */
const GEN_DEV_DOC_MODE_CONFIG = {
  generate: {
    title: '生成开发文档',
    confirmLabel: '生成开发文档',
    hint: '补充说明（可选）—— 告诉 Claude 生成时要额外注意什么',
    placeholder: '如：重点关注性能、参考某个现有模块的代码风格、给出更细的实现步骤…',
  },
  regenerate: {
    title: '重新生成开发文档',
    confirmLabel: '重新生成',
    hint: '补充说明（可选）—— 本次会基于最新 PRD 从零重新生成，覆盖现有版本',
    placeholder: '如：重点关注性能、参考某个现有模块的代码风格、给出更细的实现步骤…',
  },
} as const

/**
 * 「生成开发文档」确认弹框（generate/regenerate 一次性生成场景）：点击开发文档 Tab / 生成按钮 /
 * 重新生成按钮时不再直接触发，先弹这个框，让用户补充自定义提示词，拼进后端 buildDevDocPrompt
 * 的 user prompt。"更新版本"（基于当前开发文档增量更新）走多轮澄清，见 DevDocUpdateDialog。
 */
function GenerateDevDocDialog({
  mode,
  onConfirm,
  onClose,
}: {
  mode: 'generate' | 'regenerate'
  onConfirm: (extraInstructions: string) => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const cfg = GEN_DEV_DOC_MODE_CONFIG[mode]

  const appendPreset = (preset: string) => {
    setText((t) => (t.trim() ? `${t.trim()}\n${preset}` : preset))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <h3 className="font-semibold text-sm">{cfg.title}</h3>
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-2">
              {cfg.hint}
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder={cfg.placeholder}
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
            />
          </div>

          <div>
            <div className="text-[11px] text-[var(--color-muted-foreground)] mb-1.5">常用预设（点击追加）</div>
            <div className="flex flex-wrap gap-1.5">
              {DEV_DOC_PROMPT_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => appendPreset(p)}
                  className="px-2 py-1 rounded-full text-[11px] border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-ring)] hover:text-[var(--color-foreground)] transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] hover:bg-[var(--color-muted)]/30"
            >
              取消
            </button>
            <button
              onClick={() => onConfirm(text.trim())}
              className="px-4 py-1.5 rounded-md text-sm bg-purple-600 text-white hover:opacity-90"
            >
              {cfg.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * 「基于当前开发文档更新」专用弹框：跟 GenerateDevDocDialog（generate/regenerate 一次性生成）
 * 不同，update 走跟 PRD 一样的多轮渐进澄清——内部维护 step 状态机：
 *   input（填初步更新说明 + 可选上传附件补充上下文）
 *   → clarifying（Claude 针对开发文档里不明确的地方逐轮提问，最多 5 轮，对齐 ChattingPanel 交互）
 * 澄清完成后把「初步说明 + 完整问答记录」拼成最终 extraInstructions 交给调用方去真正生成，
 * 调用方（EditingPanel）负责以 updateExisting=true 调 handleGenerateDevDoc。
 */
function DevDocUpdateDialog({
  sessionId,
  onConfirm,
  onClose,
}: {
  sessionId: string
  /** 澄清完成后回调：初步说明与问答记录分别传出，不再拼成一段文本——由后端结构化持久化，
   *  使这一版的澄清记录能跟 PRD 首次澄清记录分开单独展示。 */
  onConfirm: (extraInstructions: string, qaHistory: QaPair[]) => void
  onClose: () => void
}) {
  const maxRounds = 5
  const [step, setStep] = useState<'input' | 'clarifying'>('input')

  // ── input 步骤：初步更新说明 + 附件 ──
  const [notes, setNotes] = useState('')
  const [attachments, setAttachments] = useState<AttachmentParseResult[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  /** 进入 clarifying 后固定的初步说明（含附件内容），避免每轮重新拼接 */
  const finalNotesRef = useRef('')

  // ── clarifying 步骤：结构对齐 ChattingPanel ──
  const [history, setHistory] = useState<QaPair[]>([])
  const [currentQ, setCurrentQ] = useState('')
  const [currentA, setCurrentA] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<(() => void) | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const answerInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => () => abortRef.current?.(), [])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [history, currentQ])
  useEffect(() => {
    if (!isStreaming && currentQ && !currentQ.includes('[CLARIFICATION_COMPLETE]')) {
      setTimeout(() => answerInputRef.current?.focus(), 100)
    }
  }, [isStreaming, currentQ])

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadError(null)
    setUploadingFile(true)
    try {
      const results = await Promise.all(Array.from(files).map((f) => parseAttachment(f)))
      setAttachments((prev) => [...prev, ...results])
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '文件解析失败')
    } finally {
      setUploadingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /** 把附件内容追加到 notes，形成完整的初步更新说明 */
  const buildFinalNotes = () => {
    let final = notes.trim()
    if (attachments.length > 0) {
      final += '\n\n' + attachments.map((a) =>
        `---\n【附件：${a.fileName}】\n${a.text}${a.truncated ? '\n（内容已截断）' : ''}\n---`
      ).join('\n\n')
    }
    return final
  }

  const askQuestion = (index: number, hist: QaPair[]) => {
    setCurrentQ('')
    setIsStreaming(true)
    const accRef = { current: '' }
    const abort = askNextDevDocQuestion(sessionId, index, hist, finalNotesRef.current, {
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
            finishClarify(hist)
          }
        }
        if (name === 'error') {
          setIsStreaming(false)
        }
      },
      onError() { setIsStreaming(false) },
    })
    abortRef.current = abort
  }

  /** 澄清完成：初步说明与问答记录分别传给调用方，不再拼成一段文本（见 onConfirm 类型注释） */
  const finishClarify = (finalHistory: QaPair[]) => {
    onConfirm(finalNotesRef.current, finalHistory)
  }

  const handleStartClarify = () => {
    finalNotesRef.current = buildFinalNotes()
    setStep('clarifying')
    askQuestion(0, [])
  }

  const handleSubmitAnswer = () => {
    const answer = currentA.trim()
    if (!answer) return
    const newPair: QaPair = { question: currentQ, answer }
    const newHistory = [...history, newPair]
    setHistory(newHistory)
    setCurrentA('')
    setCurrentQ('')
    askQuestion(newHistory.length, newHistory)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmitAnswer()
    }
  }

  const isDone = !isStreaming && currentQ.includes('[CLARIFICATION_COMPLETE]')
  const progress = Math.round((history.length / maxRounds) * 100)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] flex-shrink-0">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <GitBranch className="w-4 h-4 text-purple-400" />
            基于当前开发文档更新
          </h3>
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 'input' ? (
          <div className="p-5 space-y-3 overflow-y-auto">
            <p className="text-[11px] text-purple-400 bg-purple-500/10 border border-purple-500/20 rounded-md px-2.5 py-1.5">
              会先针对更新说明里不够明确的地方跟你确认几轮（最多 {maxRounds} 轮），再生成更新后的
              新版本；生成前会自动备份当前版本（{'{id}'}-dev-v{'{n}'}.md），不会丢失现有内容。
            </p>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-[var(--color-muted-foreground)]">
                  本次更新说明
                </label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                  className="flex items-center gap-1 px-2 py-0.5 text-[11px] rounded border border-[var(--color-border)] hover:border-[var(--color-ring)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
                >
                  {uploadingFile ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                  {uploadingFile ? '解析中…' : '上传附件补充上下文'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.txt,.pdf,.docx,.doc"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileUpload(e.target.files)}
                />
              </div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="如：新增了退款审批环节、调整了订单查询接口的入参…（可留空，附件也算说明）"
                className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
              />
              {uploadError && <p className="text-xs text-red-500 mt-1">{uploadError}</p>}
            </div>

            {attachments.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] text-[var(--color-muted-foreground)]">
                  附件内容将追加到更新说明（共 {attachments.length} 个）：
                </p>
                {attachments.map((att, i) => (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/30">
                    <FileText className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-primary)]" />
                    <span className="text-xs font-medium truncate flex-1">{att.fileName}</span>
                    <button
                      onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      className="text-[var(--color-muted-foreground)] hover:text-red-500"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-[var(--color-border)] hover:bg-[var(--color-muted)]/30">
                取消
              </button>
              <button onClick={handleStartClarify} className="px-4 py-1.5 rounded-md text-sm bg-purple-600 text-white hover:opacity-90">
                开始澄清
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* 进度条 */}
            <div className="flex items-center gap-3 px-5 py-2 border-b border-[var(--color-border)] flex-shrink-0">
              <span className="text-xs text-[var(--color-muted-foreground)]">
                更新澄清：{history.length} / {maxRounds} 题
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--color-muted)]">
                <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              {isStreaming && (
                <div className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Claude 思考中…
                </div>
              )}
            </div>

            {/* 对话气泡区 */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[200px]">
              {history.map((qa, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                      <BotMessageSquare className="w-3.5 h-3.5 text-purple-400" />
                    </div>
                    <div className="flex-1 rounded-xl rounded-tl-sm bg-[var(--color-muted)]/50 px-3 py-2 text-sm leading-relaxed">
                      {qa.question}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 justify-end">
                    <div className="flex-1 rounded-xl rounded-tr-sm bg-purple-500/10 border border-purple-500/20 px-3 py-2 text-sm leading-relaxed text-right ml-6">
                      {qa.answer}
                    </div>
                    <div className="w-6 h-6 rounded-full bg-[var(--color-muted)] flex items-center justify-center flex-shrink-0">
                      <User className="w-3.5 h-3.5 text-[var(--color-muted-foreground)]" />
                    </div>
                  </div>
                </div>
              ))}

              {currentQ && !isDone && (
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <BotMessageSquare className="w-3.5 h-3.5 text-purple-400" />
                  </div>
                  <div className="flex-1 rounded-xl rounded-tl-sm bg-[var(--color-muted)]/50 px-3 py-2 text-sm leading-relaxed">
                    {currentQ}
                    {isStreaming && (
                      <span className="inline-block w-1.5 h-3.5 bg-purple-400 rounded animate-pulse ml-1 align-middle" />
                    )}
                  </div>
                </div>
              )}

              {isStreaming && !currentQ && (
                <div className="flex items-center gap-2 text-xs text-[var(--color-muted-foreground)] italic px-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Claude 正在分析当前开发文档，生成澄清问题…
                </div>
              )}

              {isDone && (
                <div className="flex items-center gap-2 text-xs text-purple-400 px-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  澄清完成，正在生成更新后的开发文档…
                </div>
              )}

              <div ref={endRef} />
            </div>

            {/* 回答输入区 */}
            {!isDone && !isStreaming && currentQ && (
              <div className="border-t border-[var(--color-border)] p-3 flex-shrink-0">
                <div className="flex gap-2 items-end">
                  <textarea
                    ref={answerInputRef}
                    value={currentA}
                    onChange={(e) => setCurrentA(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    placeholder="输入你的回答…（Ctrl+Enter 提交）"
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
                  />
                  <button
                    disabled={!currentA.trim()}
                    onClick={handleSubmitAnswer}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600 text-white text-sm hover:opacity-90 disabled:opacity-40"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 生成场景 → 标签样式，跟历史侧边栏 role 徽标同一套视觉语言（配色分开，一眼区分三种场景）。
 * mode 为 null（旧数据没有生成记录，见 DevDocVersionSummary 类型注释）时用灰色兜底样式。
 */
const DEV_DOC_MODE_LABEL: Record<'generate' | 'regenerate' | 'update', { label: string; color: string; bg: string }> = {
  generate: { label: '首次生成', color: 'text-purple-400', bg: 'bg-purple-500/15 border-purple-500/20' },
  regenerate: { label: '重新生成', color: 'text-blue-400', bg: 'bg-blue-500/15 border-blue-500/20' },
  update: { label: '更新版本', color: 'text-amber-500', bg: 'bg-amber-500/15 border-amber-500/20' },
}
const DEV_DOC_MODE_UNKNOWN = { label: '历史版本', color: 'text-[var(--color-muted-foreground)]', bg: 'bg-[var(--color-muted)]/40 border-[var(--color-border)]' }

/**
 * 开发文档生成记录只读抽屉：列出该会话开发文档的所有版本（打开时向后端拉取，以磁盘上
 * 实际存在的备份文件为准——不依赖 devDocHistory JSON，早于「生成记录」功能上线、
 * 只有磁盘备份没有 JSON 记录的旧版本也会出现在列表里，只是没有补充说明可看）。
 * UI 结构对齐 PRD 的 ClarifyHistorySheet（同一套"记录抽屉"视觉语言）。
 */
function DevDocHistorySheet({
  sessionId,
  onViewVersion,
  onClose,
}: {
  sessionId: string
  /** 点「查看此版本」时回调，由调用方去拉取该版本内容并展示；isCurrent 一并带出，避免调用方重复判断 */
  onViewVersion: (version: number, isCurrent: boolean) => void
  onClose: () => void
}) {
  const [versions, setVersions] = useState<DevDocVersionSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    listDevDocVersions(sessionId)
      .then((list) => { if (!cancelled) setVersions(list) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '加载失败') })
    return () => { cancelled = true }
  }, [sessionId])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[var(--color-card)] border-l border-[var(--color-border)] flex flex-col shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-purple-400" />
            <span className="font-semibold text-sm">开发文档生成记录</span>
            {versions && <span className="text-xs text-[var(--color-muted-foreground)]">（共 {versions.length} 版）</span>}
          </div>
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error ? (
            <p className="text-sm text-red-500">加载失败：{error}</p>
          ) : versions === null ? (
            <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="w-4 h-4 animate-spin" /> 加载中…
            </div>
          ) : versions.length === 0 ? (
            <p className="text-sm text-[var(--color-muted-foreground)] italic">暂无生成记录</p>
          ) : (
            versions.map((entry) => {
              const cfg = entry.mode ? DEV_DOC_MODE_LABEL[entry.mode] : DEV_DOC_MODE_UNKNOWN
              return (
                <div key={entry.version} className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[var(--color-muted)]/30">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-5 rounded-full bg-[var(--color-primary)]/15 flex items-center justify-center text-[10px] font-semibold text-[var(--color-primary)]">
                        v{entry.version}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border leading-tight ${cfg.bg} ${cfg.color}`}>
                        {cfg.label}
                      </span>
                      {entry.isCurrent && (
                        <span className="text-[9px] px-1 rounded bg-green-500/15 text-green-500 border border-green-500/20 leading-tight">
                          当前
                        </span>
                      )}
                    </div>
                    {entry.generatedAt && (
                      <span className="text-[11px] text-[var(--color-muted-foreground)]">
                        {new Date(entry.generatedAt).toLocaleString('zh-CN', {
                          month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    )}
                  </div>
                  <div className="p-3 text-sm leading-relaxed">
                    {entry.mode === null ? (
                      <span className="text-[var(--color-muted-foreground)] italic">
                        （这版早于生成记录功能上线，无补充说明记录，但可以查看当时的文档内容）
                      </span>
                    ) : (
                      <>
                        {entry.extraInstructions ? (
                          <p className="whitespace-pre-wrap">{entry.extraInstructions}</p>
                        ) : entry.qaHistory.length === 0 ? (
                          <p className="text-[var(--color-muted-foreground)] italic">（未填写补充说明）</p>
                        ) : null}
                        {/* 这一版专属的澄清问答（update 模式才有）——跟 PRD 首次澄清记录是两份独立数据 */}
                        {entry.qaHistory.length > 0 && (
                          <div className="space-y-1.5 mt-2">
                            <div className="text-[10px] font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide">
                              本版澄清问答（{entry.qaHistory.length} 轮）
                            </div>
                            {entry.qaHistory.map((qa, i) => (
                              <div key={i} className="rounded-lg border border-[var(--color-border)]/60 overflow-hidden">
                                <div className="flex items-start gap-1.5 px-2 py-1.5 bg-[var(--color-muted)]/20 text-xs">
                                  <span className="text-[var(--color-primary)] font-semibold flex-shrink-0">Q{i + 1}</span>
                                  <span>{qa.question}</span>
                                </div>
                                <div className="flex items-start gap-1.5 px-2 py-1.5 text-xs text-[var(--color-muted-foreground)]">
                                  <span className="flex-shrink-0">A</span>
                                  <span>{qa.answer}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="px-3 pb-2.5">
                    <button
                      onClick={() => onViewVersion(entry.version, entry.isCurrent)}
                      className="text-xs text-purple-400 hover:underline"
                    >
                      查看此版本文档内容 →
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
        <div className="px-5 py-3 border-t border-[var(--color-border)] text-xs text-[var(--color-muted-foreground)]">
          点「查看此版本文档内容」可预览任意历史版本的完整文档
        </div>
      </div>
    </div>
  )
}

/**
 * 历史版本预览弹框：只读展示某个历史版本的开发文档全文——「提供选择」的落地方式：
 * 用户在 DevDocHistorySheet 点某个版本后，这里异步拉取该版本内容并展示。
 */
function DevDocVersionViewDialog({
  sessionId,
  version,
  isLatest,
  onClose,
}: {
  sessionId: string
  version: number
  isLatest: boolean
  onClose: () => void
}) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setContent(null)
    setError(null)
    getDevDocVersionContent(sessionId, version)
      .then((c) => { if (!cancelled) setContent(c) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : '加载失败') })
    return () => { cancelled = true }
  }, [sessionId, version])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-3xl h-[85vh] rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-purple-400" />
            <span className="font-semibold text-sm">开发文档 v{version}</span>
            {isLatest && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-500 border border-green-500/20 leading-tight">
                当前版本
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {content && (
              <button onClick={() => navigator.clipboard.writeText(content)}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                <Copy className="w-3 h-3" /> 复制
              </button>
            )}
            <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {error ? (
            <div className="h-full flex items-center justify-center text-sm text-red-500">加载失败：{error}</div>
          ) : content === null ? (
            <div className="h-full flex items-center justify-center text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> 加载中…
            </div>
          ) : content ? (
            <MarkdownViewer content={content} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-[var(--color-muted-foreground)] italic">
              该版本内容不存在（可能已被清理）
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ───── 角色配置 ─────
const ROLE_CONFIG = {
  PRODUCT: {
    label: '产品 / 开发',
    badge: '专业模式',
    desc: '会问设计细节、技术约束、边界条件',
    placeholder: '描述需求的背景、期望功能、约束条件等，越详细越好。Claude 会根据你的描述提出专业的澄清问题。',
    color: 'text-blue-500',
    bg: 'bg-blue-500/10 border-blue-500/30',
  },
  BUSINESS: {
    label: '业务员',
    badge: '业务模式',
    desc: '只问影响业务结果的关键问题，跳过技术/界面细节',
    placeholder: '用你自己的语言描述：你在工作中遇到了什么问题？你希望系统能帮你做什么？不用担心技术细节，写清楚业务场景就好。',
    color: 'text-green-500',
    bg: 'bg-green-500/10 border-green-500/30',
  },
} as const

// ───── 表单（Step INPUT） ─────
function InputPanel({
  onStart,
  onStartVibe,
  initialTitle = '',
  initialRawInput = '',
  initialProject = '',
  initialModule = '',
}: {
  // reqType/maxQuestions 可选：业务员角色不弹确认框，直接省略这两个参数，
  // 交给后端 LLM 自动判定（见 handleStart/handleStartVibe 里对应处理）
  onStart: (title: string, rawInput: string, project: string, module: string, role: 'PRODUCT' | 'BUSINESS', reqType?: PrdReqType, maxQuestions?: number) => void
  onStartVibe: (title: string, rawInput: string, project: string, module: string, role: 'PRODUCT' | 'BUSINESS', reqType?: PrdReqType, maxQuestions?: number) => void
  initialTitle?: string
  initialRawInput?: string
  initialProject?: string
  initialModule?: string
}) {
  const [title, setTitle] = useState(initialTitle)
  const [rawInput, setRawInput] = useState(initialRawInput)
  const [project, setProject] = useState(initialProject)
  // module 对外契约不变：逗号分隔的字符串（跟历史记录/后端 prd_session.module 单列 TEXT 兼容，
  // 无需改 schema）。UI 层用 MultiSelect 多选，只是把选中的模块名 join(', ') 写回这个字符串。
  const [module, setModule] = useState(initialModule)
  const [role, setRole] = useState<'PRODUCT' | 'BUSINESS'>('PRODUCT')
  /** 点「开始澄清」/「Vibe Coding 澄清」时先弹出 StartClarifyDialog 确认需求类型+深度，
   *  确认后才真正调用对应的 onStart/onStartVibe；null 表示弹框未打开。 */
  const [pendingAction, setPendingAction] = useState<'start' | 'startVibe' | null>(null)
  /** 已上传并解析的附件列表 */
  const [attachments, setAttachments] = useState<AttachmentParseResult[]>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 当外部初始值变化时（如从 showcase 跳转带参数）同步更新
  useEffect(() => { if (initialTitle) setTitle(initialTitle) }, [initialTitle])
  useEffect(() => { if (initialRawInput) setRawInput(initialRawInput) }, [initialRawInput])
  useEffect(() => { if (initialProject) setProject(initialProject) }, [initialProject])
  useEffect(() => { if (initialModule) setModule(initialModule) }, [initialModule])

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setUploadError(null)
    setUploadingFile(true)
    try {
      const results = await Promise.all(
        Array.from(files).map(f => parseAttachment(f))
      )
      setAttachments(prev => [...prev, ...results])
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : '文件解析失败')
    } finally {
      setUploadingFile(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /** 提交时将附件内容追加到 rawInput */
  const buildFinalRawInput = () => {
    let final = rawInput.trim()
    if (attachments.length > 0) {
      final += '\n\n' + attachments.map(a =>
        `---\n【附件：${a.fileName}】\n${a.text}${a.truncated ? '\n（内容已截断）' : ''}\n---`
      ).join('\n\n')
    }
    return final
  }

  // 拉取项目列表：用 claude-chat/workspaces 而非 /projects，
  // 因为 workspaces 支持多个 workspace root（包含 D:\yoooni\ 等非 myWork 根目录），
  // 而 /projects 只扫 toolbox.projects.root 单个根，会遗漏其他根下的项目（如 yoooni）。
  const { data: workspacesData } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => http<{
      roots: Array<{ root: string; exists: boolean; dirs: Array<{ name: string; path: string }> }>
    }>('/claude-chat/workspaces'),
  })

  // 将所有 root 下的 dirs 展平为统一的项目列表（去重：同名取第一个）
  const projects: Array<{ name: string; path: string }> = (() => {
    if (!workspacesData?.roots) return []
    const seen = new Set<string>()
    const result: Array<{ name: string; path: string }> = []
    for (const root of workspacesData.roots) {
      if (!root.exists) continue
      for (const dir of root.dirs ?? []) {
        if (!seen.has(dir.name)) {
          seen.add(dir.name)
          result.push(dir)
        }
      }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  })()

  // 拉取模块列表（选了项目后）
  const { data: modulesData } = useQuery({
    queryKey: ['project-modules', project],
    queryFn: () => {
      const item = projects.find((p) => p.name === project)
      if (!item) return null
      return http<{ modules: Array<{ name: string }> }>(
        `/claude-chat/workspaces/modules?path=${encodeURIComponent(item.path)}`
      )
    },
    enabled: !!project && projects.length > 0,
  })

  const modules: Array<{ name: string }> = modulesData?.modules ?? []

  // 已选模块 tag 数组：从 module 字符串派生（支持中英文逗号/顿号分隔，兼容历史遗留数据），
  // 传给 MultiSelect 做受控 value；onChange 里再 join(', ') 写回 module 字符串。
  const moduleTags = module.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)

  // 标题必填；描述 OR 至少有一个附件即可提交
  const canSubmit = title.trim() && (rawInput.trim() || attachments.length > 0)

  return (
    <div className="flex-1 p-6 overflow-y-auto">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* 角色切换：决定 Claude 澄清的问题深度和语言风格 */}
        <div>
          <label className="block text-xs font-medium text-[var(--color-muted-foreground)] mb-2">你是谁？（决定 Claude 如何提问）</label>
          <div className="grid grid-cols-2 gap-2">
            {(['PRODUCT', 'BUSINESS'] as const).map((r) => {
              const cfg = ROLE_CONFIG[r]
              const active = role === r
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    active ? cfg.bg : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-sm font-semibold ${active ? cfg.color : 'text-[var(--color-foreground)]'}`}>
                      {cfg.label}
                    </span>
                    {active && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color}`}>
                        {cfg.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[var(--color-muted-foreground)] leading-relaxed">
                    {cfg.desc}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* 快速示例（标题和 rawInput 都为空时才展示，避免干扰已输入的内容） */}
        {!title.trim() && !rawInput.trim() && (
          <div>
            <div className="text-xs text-[var(--color-muted-foreground)] mb-2 flex items-center gap-1.5">
              <FileText className="w-3 h-3" />
              演示示例（一键加载）
            </div>
            <div className="flex gap-2 flex-wrap">
              {QUICK_TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  onClick={() => {
                    // 一次性加载完整示例数据（标题 + 原始需求 + 项目 + 模块）
                    setTitle(t.title)
                    setRawInput(t.rawInput)
                    setProject(t.project)
                    setModule(t.module)
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border border-[var(--color-border)] hover:border-[var(--color-ring)] bg-[var(--color-muted)]/30 text-[var(--color-foreground)] transition-colors"
                >
                  {t.label}
                  <span className="text-[var(--color-muted-foreground)]">· {t.hint}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">需求标题 <span className="text-red-500">*</span></label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="如：用户权限管理模块 - 支持角色继承"
            className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">关联项目（可选）</label>
            <Combobox
              id="project-input"
              value={project}
              onChange={(v) => { setProject(v); setModule('') }}
              options={projects.map((p) => ({ label: p.name, value: p.name }))}
              placeholder="如：kai-toolbox（可手动输入）"
              emptyText="无匹配项目，可直接输入"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">关联模块（可选，可多选）</label>
            <MultiSelect
              id="module-input"
              value={moduleTags}
              onChange={(tags) => setModule(tags.join(', '))}
              options={modules.map((m) => ({ label: m.name, value: m.name }))}
              placeholder="如：tool-reqpool（可下拉勾选或输入多个）"
            />
          </div>
        </div>

        {/* 原始需求描述 + 附件上传区 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium">原始需求描述 <span className="text-red-500">*</span></label>
            {/* 附件上传按钮 */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingFile}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-[var(--color-border)] hover:border-[var(--color-ring)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
              title="上传 Markdown / PDF / Word 文件，提取文字作为需求描述"
            >
              {uploadingFile ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
              {uploadingFile ? '解析中…' : '上传附件'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.pdf,.docx,.doc"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files)}
            />
          </div>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            rows={attachments.length > 0 ? 4 : 8}
            placeholder={ROLE_CONFIG[role].placeholder}
            className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm resize-y focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
          />

          {/* 上传错误 */}
          {uploadError && (
            <p className="text-xs text-red-500 mt-1">{uploadError}</p>
          )}

          {/* 已上传附件列表 */}
          {attachments.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-[11px] text-[var(--color-muted-foreground)] mb-1.5">
                附件内容将自动追加到需求描述（共 {attachments.length} 个）：
              </p>
              {attachments.map((att, i) => (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-muted)]/30">
                  <FileText className="w-3.5 h-3.5 flex-shrink-0 text-[var(--color-primary)]" />
                  <span className="text-xs font-medium truncate flex-1">{att.fileName}</span>
                  <span className="text-[10px] text-[var(--color-muted-foreground)]">
                    {(att.text.length / 1000).toFixed(1)}k 字{att.truncated ? '（已截断）' : ''}
                  </span>
                  <button
                    onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                    className="text-[var(--color-muted-foreground)] hover:text-red-500"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 两种澄清模式：产品/开发角色先弹 StartClarifyDialog 确认需求类型+澄清深度；
            业务员角色不弹（业务员不懂 Bug/模块调整/新增模块这种技术分类，也判断不出该问几轮），
            直接进入澄清，需求类型交给后端 LLM 自动判定（见 PrdClarifyService.classifyReqType） */}
        <div className="flex gap-2">
          {/* 标准模式（内嵌简化 UI） */}
          <button
            disabled={!canSubmit}
            onClick={() => {
              if (role === 'BUSINESS') onStart(title.trim(), buildFinalRawInput(), project, module, role)
              else setPendingAction('start')
            }}
            className="flex-1 py-2.5 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            {role === 'BUSINESS' ? '开始描述我的业务需求' : '开始澄清'}
          </button>
          {/* Vibe Coding 模式（完整工具调用可见） */}
          <button
            disabled={!canSubmit}
            onClick={() => {
              if (role === 'BUSINESS') onStartVibe(title.trim(), buildFinalRawInput(), project, module, role)
              else setPendingAction('startVibe')
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-md border border-[var(--color-border)] bg-[var(--color-muted)]/30 text-sm text-[var(--color-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="在 Vibe Coding 中澄清：完整可见工具调用、MCP/CLI 查询过程"
          >
            <Code2 className="w-3.5 h-3.5" />
            Vibe Coding 澄清
          </button>
        </div>
      </div>

      {pendingAction && (
        <StartClarifyDialog
          onClose={() => setPendingAction(null)}
          onConfirm={(reqType, maxQuestions) => {
            const action = pendingAction
            setPendingAction(null)
            const args = [title.trim(), buildFinalRawInput(), project, module, role, reqType, maxQuestions] as const
            if (action === 'start') onStart(...args)
            else onStartVibe(...args)
          }}
        />
      )}
    </div>
  )
}

// ───── 生成阶段流式展示（含失败重试 UI） ─────
function GeneratingPanel({
  streamText,
  failed,
  onRetry,
}: {
  streamText: string
  failed: boolean
  onRetry: () => void
}) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [streamText])

  if (failed) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <X className="w-6 h-6 text-red-500" />
        </div>
        <div>
          <p className="font-medium text-[var(--color-foreground)] mb-1">PRD 生成未能完成</p>
          <p className="text-sm text-[var(--color-muted-foreground)]">
            可能是 Claude Agent 超时（复杂需求通常需要 60-120 秒）。<br />
            问答历史已保存，点击重试即可直接重新生成。
          </p>
        </div>
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90"
        >
          <Loader2 className="w-4 h-4" />
          重新生成 PRD
        </button>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden">
      <div className="flex items-center gap-2 mb-4 text-sm text-[var(--color-muted-foreground)]">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Claude 正在撰写 PRD 文档…</span>
      </div>
      <div className="flex-1 overflow-y-auto rounded-lg bg-[var(--color-muted)]/30 p-4 text-sm whitespace-pre-wrap break-words leading-relaxed">
        {streamText || <span className="italic">等待 Claude 响应…</span>}
        <div ref={endRef} />
      </div>
    </div>
  )
}

// ───── 多轮渐进澄清对话面板（Step CHATTING） ─────
function ChattingPanel({
  sessionId,
  onDone,       // 澄清完成，带完整 history 调用
  onError,
}: {
  sessionId: string
  onDone: (history: QaPair[]) => void
  onError: (msg: string) => void
}) {
  const [history, setHistory] = useState<QaPair[]>([])          // 已完成的 Q&A
  const [currentQ, setCurrentQ] = useState('')                  // 当前问题（流式积累）
  const [currentA, setCurrentA] = useState('')                  // 用户正在输入的答案
  const [isStreaming, setIsStreaming] = useState(true)          // Claude 正在输出问题
  const abortRef = useRef<(() => void) | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => endRef.current?.scrollIntoView({ behavior: 'smooth' })

  // 挂载时立即开始第一个问题
  useEffect(() => {
    askQuestion(0, [])
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
    const answer = currentA.trim()
    if (!answer) return

    const newPair: QaPair = { question: currentQ, answer }
    const newHistory = [...history, newPair]
    setHistory(newHistory)
    setCurrentA('')
    setCurrentQ('')

    // 触发下一个问题
    askQuestion(newHistory.length, newHistory)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmitAnswer()
    }
  }

  const isDone = !isStreaming && currentQ.includes('[CLARIFICATION_COMPLETE]')
  const maxRounds = 5
  const progress = Math.round(((history.length) / maxRounds) * 100)

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
            Claude 思考中…
          </div>
        )}
      </div>

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
                <span>Claude 正在分析需求，查询知识图谱…</span>
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
                {qa.answer}
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
            <textarea
              ref={inputRef}
              value={currentA}
              onChange={e => setCurrentA(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              placeholder="输入你的回答… (Ctrl+Enter 提交)"
              className="flex-1 px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-input)] text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
            />
            <button
              disabled={!currentA.trim()}
              onClick={handleSubmitAnswer}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 self-end"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-center text-[var(--color-muted-foreground)] mt-2">
            Claude 会根据你的回答动态追问，最多 {maxRounds} 轮
          </p>
        </div>
      )}

      {/* 流式中占位输入区 */}
      {isStreaming && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-card)] p-4">
          <div className="max-w-3xl mx-auto h-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-muted)]/30 flex items-center gap-2 px-3 text-xs text-[var(--color-muted-foreground)]">
            <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
            <span className="italic">
              {currentQ ? 'Claude 正在输出问题…' : 'Claude 正在查询知识图谱，生成精准问题中（约 10-30 秒）…'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// sessionStorage key，与 ChatPage handoff 约定一致
const PRD_DEV_LAUNCH_KEY = 'kai-toolbox:claude-chat:prd-dev-launch'

// ───── 开始开发 Dialog（sessionStorage handoff → Vibe Coding） ─────
function StartDevDialog({
  title,
  sessionId,
  projectName,
  content,
  devDocContent,
  onClose,
}: {
  title: string
  sessionId: string
  projectName: string | null
  content: string           // PRD 内容（兜底）
  devDocContent?: string    // 开发文档内容（优先使用）
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [launching, setLaunching] = useState(false)

  // 优先使用开发文档（有具体技术方案）；无开发文档时用 PRD + feature-dev 引导
  const hasDevDoc = !!(devDocContent && devDocContent.trim())

  /** 构建发给 Vibe Coding 的第一条消息 */
  const buildSeed = () => {
    if (hasDevDoc) {
      // Phase 1-4 全部完成（PRD 澄清 + 代码库探索 + 架构设计），直接从 Phase 5 实施
      return `请执行 /feature-dev:feature-dev，跳过已完成的阶段，从 Phase 5 开始：

## feature-dev 已完成阶段状态
- ✅ Phase 1 (Discovery) — 已完成：需求标题《${title}》
- ✅ Phase 2 (Codebase Exploration) — 已完成：见技术方案文档
- ✅ Phase 3 (Clarifying Q&A) — 已完成：经 AI 渐进澄清
- ✅ Phase 4 (Architecture Design) — 已完成：见下方技术方案文档

## 技术方案文档（Phase 4 产出）

${devDocContent}

---

## 执行指令
请从 **Phase 5 (Implementation)** 开始：
1. 严格按技术方案文档的「实现步骤（有序任务清单）」逐项执行，不跳过顺序
2. 执行「数据库变更」章节的 DDL/ALTER（幂等）
3. 实现「API 接口设计」章节的接口
4. 每完成一个任务项报告进度，有疑问先问再做
5. 全部任务完成后执行 **Phase 6 (Code Review)**

PRD_SESSION_ID: ${sessionId}`
    }

    // 无开发文档：Phase 1-3 完成，从 Phase 2 重新探索代码库开始
    return `请执行 /feature-dev:feature-dev，以下阶段已完成：

## feature-dev 已完成阶段状态
- ✅ Phase 1 (Discovery) — 已完成：见 PRD 文档
- ✅ Phase 3 (Clarifying Q&A) — 已完成：经 AI 渐进澄清
- ⬜ Phase 2 (Codebase Exploration) — 待执行
- ⬜ Phase 4 (Architecture Design) — 待执行
- ⬜ Phase 5 (Implementation) — 待执行

## PRD 文档（Phase 1+3 产出）

${content}

---

## 执行指令
请从 **Phase 2 (Codebase Exploration)** 开始：
1. 探索相关现有代码（Controller / Service / Repository / 前端组件）
2. Phase 4：设计技术方案（DB 变更 / API / 实现步骤清单）
3. Phase 5：按方案逐步实现，完成后将方案文档保存到 \`docs/design/\`
4. Phase 6：Code Review

PRD_SESSION_ID: ${sessionId}`
  }

  const handleLaunch = async () => {
    setLaunching(true)
    try {
      // 查询项目的 cwd（workspace 绝对路径）
      let cwd = ''
      if (projectName) {
        try {
          const res = await fetch('/api/claude-chat/workspaces', {
            headers: { Authorization: `Bearer ${localStorage.getItem('toolbox.auth.token') ?? ''}` },
          })
          if (res.ok) {
            const data = await res.json() as {
              roots: Array<{ exists: boolean; dirs: Array<{ name: string; path: string }> }>
            }
            for (const root of data.roots ?? []) {
              const found = root.dirs?.find(d => d.name === projectName)
              if (found) { cwd = found.path; break }
            }
          }
        } catch { /* cwd 解析失败时留空，让用户在工作台手动选 */ }
      }

      // 写入 sessionStorage（ChatPage 消费后自动删除）
      sessionStorage.setItem(PRD_DEV_LAUNCH_KEY, JSON.stringify({
        cwd,
        seed: buildSeed(),
        prdSessionId: sessionId,
      }))

      // 跳转到 Vibe Coding
      navigate('/tools/claude-chat')
      onClose()
    } finally {
      setLaunching(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Rocket className="w-4 h-4 text-green-500" />
            <span className="font-semibold text-sm">开始开发 — {title}</span>
          </div>
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 说明 */}
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-[var(--color-foreground)] leading-relaxed">
            点击「启动开发会话」，系统将自动：
          </p>
          {/* 携带文档类型提示 */}
          {hasDevDoc ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs text-purple-400">
              <Wrench className="w-3.5 h-3.5 flex-shrink-0" />
              <span>携带<strong className="mx-1">开发方案文档</strong>（含 DB 变更/API 设计/任务清单），Claude 可直接按方案实现，无需重新分析</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-500">
              <FileText className="w-3.5 h-3.5 flex-shrink-0" />
              <span>携带 <strong className="mx-1">PRD</strong>，Claude 将先分析技术方案再实现。建议先生成「开发文档」后再开始开发。</span>
            </div>
          )}

          <div className="space-y-2 text-sm text-[var(--color-muted-foreground)]">
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-green-500/15 text-green-500 flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">1</span>
              <span>在 <strong className="text-[var(--color-foreground)]">Vibe Coding</strong> 中打开
                {projectName ? <strong className="text-[var(--color-primary)] mx-1">{projectName}</strong> : '项目'} 工作目录
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-green-500/15 text-green-500 flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">2</span>
              <span>自动发送{hasDevDoc ? <><strong className="text-purple-400 mx-1">开发方案文档</strong>，Claude 直接按清单实现</> : <><strong className="text-[var(--color-foreground)] mx-1">PRD + feature-dev 引导</strong>（代码探索→技术方案→实现）</>}</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-green-500/15 text-green-500 flex items-center justify-center text-[11px] font-bold flex-shrink-0 mt-0.5">3</span>
              <span>开发完成后，技术方案文档自动<strong className="text-[var(--color-foreground)]">关联回此 PRD</strong></span>
            </div>
          </div>
          {!projectName && (
            <p className="text-xs text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2">
              ⚠ 未关联项目，打开工作台后需手动选择项目目录
            </p>
          )}
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--color-border)]">
          <button onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
            取消
          </button>
          <button
            disabled={launching}
            onClick={handleLaunch}
            className="flex items-center gap-2 px-5 py-2 text-sm rounded-lg bg-green-600 text-white hover:opacity-90 disabled:opacity-50 font-medium"
          >
            {launching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
            启动开发会话
          </button>
        </div>
      </div>
    </div>
  )
}




// ───── 编辑器面板（Step EDITING） ─────
function EditingPanel({
  sessionId,
  sessionTitle,
  projectName,
  initialContent,
  hasDevDoc,
  isDevDocStale,
  onReset,
}: {
  sessionId: string
  sessionTitle: string
  projectName: string | null
  initialContent: string
  /** 从历史加载时，该 PRD 是否已有开发文档（devDocPath 非空） */
  hasDevDoc?: boolean
  /** 开发文档是否过期（PRD 在开发文档生成后有更新，需要重新生成） */
  isDevDocStale?: boolean
  onReset: () => void
}) {
  const [content, setContent] = useState(initialContent)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  /** PRD 内部视图（只在 panelMode=prd 时有效） */
  const [prdViewMode, setPrdViewMode] = useState<'split' | 'edit' | 'preview'>('split')
  const [showDevDialog, setShowDevDialog] = useState(false)

  // ── 顶层面板模式：prd（仅 PRD）| dev（仅开发文档）| side（并排） ──
  // hasDevDoc=true 时默认进入 dev 模式，让用户直接看到开发文档全屏
  const [panelMode, setPanelMode] = useState<'prd' | 'dev' | 'side'>(hasDevDoc ? 'dev' : 'prd')
  /** 开发文档内部视图模式（仅 dev Tab 有效） */
  const [devViewMode, setDevViewMode] = useState<'split' | 'edit' | 'preview'>('split')
  /** 大纲滚动目标 ref（预览区的滚动容器） */
  const prdPreviewRef = useRef<HTMLDivElement>(null)
  const devPreviewRef = useRef<HTMLDivElement>(null)

  // ── 开发文档状态 ──
  const [devDocContent, setDevDocContent] = useState('')
  const [devDocStreaming, setDevDocStreaming] = useState(false)
  // 首次加载已有开发文档内容期间为 true：hasDevDoc=true 时初始为 true，避免内容还没
  // 从后端读回来的一瞬间被误判成「没有开发文档」而闪一下生成按钮/触发生成。
  const [devDocLoading, setDevDocLoading] = useState(hasDevDoc)
  const [devDocDirty, setDevDocDirty] = useState(false)
  const [devDocSaving, setDevDocSaving] = useState(false)
  const devDocAbortRef = useRef<(() => void) | null>(null)
  const devDocAccRef = useRef('')
  /** 「生成开发文档」确认弹框：非 null 时打开，值决定弹框文案/是否走"基于当前更新"模式。 */
  const [genDevDocMode, setGenDevDocMode] = useState<'generate' | 'regenerate' | 'update' | null>(null)
  /** 「生成记录」只读抽屉是否打开：追溯每一版是基于什么补充说明/更新澄清生成的。 */
  const [showDevDocHistory, setShowDevDocHistory] = useState(false)
  /** 「本版澄清」抽屉是否打开：只看当前显示版本自己的澄清问答，跟 PRD 的澄清记录完全独立。 */
  const [showDevDocClarify, setShowDevDocClarify] = useState(false)
  /** 正在预览的历史版本；null 表示预览弹框未打开。isCurrent 由 DevDocHistorySheet 拉取时一并给出。 */
  const [viewingDevDocVersion, setViewingDevDocVersion] = useState<{ version: number; isCurrent: boolean } | null>(null)

  const handleGenerateDevDoc = (extraInstructions?: string, updateExisting?: boolean, qaHistory?: QaPair[]) => {
    setPanelMode('dev')   // 生成时切到开发文档全屏视图
    setDevDocContent('')
    setDevDocStreaming(true)
    setDevDocLoading(false)
    devDocAccRef.current = ''
    devDocAbortRef.current?.()

    const abort = startGenerateDevDoc(sessionId, extraInstructions, updateExisting, qaHistory, {
      onEvent(name, data) {
        if (name === 'chunk') {
          const chunk = (data as { content: string }).content ?? ''
          devDocAccRef.current += chunk
          setDevDocContent(devDocAccRef.current)
        }
        if (name === 'done') {
          setDevDocStreaming(false)
        }
        if (name === 'error') {
          setDevDocStreaming(false)
        }
      },
      onError() { setDevDocStreaming(false) },
    })
    devDocAbortRef.current = abort
  }

  const handleSaveDevDoc = async () => {
    setDevDocSaving(true)
    try {
      await saveDevDocContent(sessionId, devDocContent)
      setDevDocDirty(false)
    } finally {
      setDevDocSaving(false)
    }
  }

  // 监听「↺ 更新」触发的重新生成事件（来自历史侧边栏，PRD 有更新导致开发文档过期）——
  // 语义是"基于最新 PRD 重新生成"，同样先弹确认框，不直接生成
  useEffect(() => {
    const handler = (e: Event) => {
      const { sessionId: sid } = (e as CustomEvent).detail as { sessionId: string }
      if (sid === sessionId) {
        setPanelMode('dev')
        setGenDevDocMode('regenerate')
      }
    }
    window.addEventListener('prd-clarify:regen-dev-doc', handler)
    return () => window.removeEventListener('prd-clarify:regen-dev-doc', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  // 进入 dev 或 side 模式时自动加载开发文档内容（只加载一次）。
  // devDocLoading 期间点击 Tab 的判空逻辑必须等这次加载落地后再决定是否需要触发生成，
  // 否则 hasDevDoc=true 但内容还没读回来的一瞬间会被误判成「没有开发文档」。
  useEffect(() => {
    if ((panelMode === 'prd') || devDocContent) return
    if (!hasDevDoc) { setDevDocLoading(false); return }
    setDevDocLoading(true)
    getDevDocContent(sessionId)
      .then(c => { if (c) setDevDocContent(c) })
      .catch(() => {})
      .finally(() => setDevDocLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelMode])

  const handleChange = (next: string) => {
    setContent(next)
    setIsDirty(next !== initialContent)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveContent(sessionId, { content })
      setIsDirty(false)
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* 开发提示词 Dialog（优先传开发文档，无则传 PRD） */}
      {showDevDialog && (
        <StartDevDialog
          title={sessionTitle}
          sessionId={sessionId}
          projectName={projectName}
          content={content}
          devDocContent={devDocContent}
          onClose={() => setShowDevDialog(false)}
        />
      )}

      {/* 生成/重新生成开发文档确认弹框：不再点了就直接生成，先让用户看一眼要不要补充提示词 */}
      {(genDevDocMode === 'generate' || genDevDocMode === 'regenerate') && (
        <GenerateDevDocDialog
          mode={genDevDocMode}
          onClose={() => setGenDevDocMode(null)}
          onConfirm={(extraInstructions) => {
            setGenDevDocMode(null)
            handleGenerateDevDoc(extraInstructions, false)
          }}
        />
      )}

      {/* 「更新版本」走跟 PRD 一样的多轮渐进澄清，而不是一次性生成 */}
      {genDevDocMode === 'update' && (
        <DevDocUpdateDialog
          sessionId={sessionId}
          onClose={() => setGenDevDocMode(null)}
          onConfirm={(extraInstructions, qaHistory) => {
            setGenDevDocMode(null)
            handleGenerateDevDoc(extraInstructions, true, qaHistory)
          }}
        />
      )}

      {/* 开发文档生成记录：追溯每一版是基于什么补充说明/更新澄清生成的，可选版本预览 */}
      {showDevDocHistory && (
        <DevDocHistorySheet
          sessionId={sessionId}
          onViewVersion={(version, isCurrent) => setViewingDevDocVersion({ version, isCurrent })}
          onClose={() => setShowDevDocHistory(false)}
        />
      )}

      {/* 本版澄清：只看当前显示版本自己的澄清问答，跟上面 PRD 的 ClarifyHistorySheet 对等，
          但数据源完全独立（session.questions vs 当前 dev doc 版本的 qaHistory） */}
      {showDevDocClarify && (
        <DevDocClarifyHistorySheet
          sessionId={sessionId}
          onClose={() => setShowDevDocClarify(false)}
        />
      )}

      {/* 历史版本预览：只读展示某个版本的完整文档内容 */}
      {viewingDevDocVersion !== null && (
        <DevDocVersionViewDialog
          sessionId={sessionId}
          version={viewingDevDocVersion.version}
          isLatest={viewingDevDocVersion.isCurrent}
          onClose={() => setViewingDevDocVersion(null)}
        />
      )}

      {/* ─── 顶部 Tab + 操作栏 ─── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-card)] gap-2">

        {/* 左：文档 Tab 切换 */}
        <div className="flex items-center gap-0.5 bg-[var(--color-muted)]/40 rounded-lg p-0.5 text-xs">
          {([
            { key: 'prd', label: 'PRD', icon: <FileText className="w-3 h-3" /> },
            { key: 'dev',
              label: isDevDocStale && devDocContent ? '⚠ 开发文档' : '开发文档',
              icon: <Wrench className="w-3 h-3" /> },
            { key: 'side', label: '并排', icon: null },
          ] as const).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => {
                setPanelMode(key)
                // 切到开发文档时，只有确认后端确实没有开发文档（hasDevDoc=false）才弹生成确认框；
                // hasDevDoc=true 但本地 devDocContent 还没读回来的一瞬间（devDocLoading）不能
                // 当作「没有开发文档」，否则会把已生成好的文档误判成需要重新生成。
                // 弹框而非直接生成：让用户先看一眼要不要补充自定义提示词再确认。
                if ((key === 'dev' || key === 'side') && !hasDevDoc && !devDocContent
                    && !devDocStreaming && !devDocLoading) {
                  setGenDevDocMode('generate')
                }
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                panelMode === key
                  ? key === 'dev'
                    ? isDevDocStale && devDocContent
                      ? 'bg-amber-500/20 text-amber-400 font-medium'  // 过期：橙色
                      : 'bg-purple-600/20 text-purple-400 font-medium'  // 正常：紫色
                    : 'bg-[var(--color-card)] text-[var(--color-foreground)] font-medium shadow-sm'
                  : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]'
              }`}
            >
              {icon}{label}
              {key === 'dev' && devDocStreaming && <Loader2 className="w-2.5 h-2.5 animate-spin ml-0.5" />}
            </button>
          ))}
        </div>

        {/* 中：子视图模式切换 */}
        <div className="flex items-center gap-1 text-xs">
          {panelMode === 'prd' && (['split', 'edit', 'preview'] as const).map((m) => (
            <button key={m} onClick={() => setPrdViewMode(m)}
              className={`px-2 py-0.5 rounded ${prdViewMode === m ? 'bg-[var(--color-primary)] text-white' : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]'}`}>
              {m === 'split' ? '分栏' : m === 'edit' ? '编辑' : '预览'}
            </button>
          ))}
          {panelMode === 'dev' && !devDocStreaming && (['split', 'edit', 'preview'] as const).map((m) => (
            <button key={m} onClick={() => setDevViewMode(m)}
              className={`px-2 py-0.5 rounded ${devViewMode === m ? 'bg-purple-600/30 text-purple-300' : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]'}`}>
              {m === 'split' ? '分栏' : m === 'edit' ? '编辑' : '预览'}
            </button>
          ))}
          {/* 重新生成（从最新 PRD 从零覆盖）+ 更新版本（基于当前开发文档增量更新，自动备份旧版本） */}
          {panelMode === 'dev' && devDocContent && !devDocStreaming && (
            <>
              <button onClick={() => setGenDevDocMode('regenerate')}
                className="ml-1 flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-muted-foreground)] hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
                title="基于最新 PRD 从零重新生成开发文档（覆盖现有版本）">
                <RefreshCw className="w-3 h-3" /> 重新生成
              </button>
              <button onClick={() => setGenDevDocMode('update')}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-muted-foreground)] hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
                title="基于当前开发文档增量更新，保留原有内容并标注改动状态，自动备份旧版本">
                <GitBranch className="w-3 h-3" /> 更新版本
              </button>
              {/* 不再靠 devDocHistory.length 判断是否显示：早于该功能上线的旧会话磁盘上
                  可能已经有多版本备份，只是没有 JSON 记录——按钮始终展示，具体有几版由
                  DevDocHistorySheet 打开时向后端查询磁盘实际情况后再展示 */}
              <button onClick={() => setShowDevDocHistory(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-muted-foreground)] hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
                title="查看所有历史版本，可选中任意版本预览完整内容">
                <Info className="w-3 h-3" /> 生成记录
              </button>
              {/* 跟 PRD Tab 的「2 AI 渐进澄清」入口对等：直接看当前这版开发文档自己的澄清问答，
                  不用先进「生成记录」再找版本——两份数据完全独立，不会跟 PRD 澄清记录混显 */}
              <button onClick={() => setShowDevDocClarify(true)}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-muted-foreground)] hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
                title="查看当前这版开发文档自己的澄清问答记录（跟 PRD 的澄清记录是两份独立数据）">
                <BotMessageSquare className="w-3 h-3" /> 本版澄清
              </button>
            </>
          )}
        </div>

        {/* 右：操作按钮 */}
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setShowDevDialog(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-green-600/20 border border-green-500/30 text-green-400 hover:bg-green-600/30 font-medium">
            <Rocket className="w-3.5 h-3.5" /> 开始开发
          </button>
          <div className="w-px h-4 bg-[var(--color-border)]" />
          <button onClick={onReset}
            className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
            <Plus className="w-3 h-3" /> 新建
          </button>
          {/* 保存（根据当前 Tab 保存对应文档） */}
          {panelMode === 'dev' ? (
            <>
              {devDocDirty && <span className="text-xs text-yellow-500">未保存</span>}
              <button onClick={() => navigator.clipboard.writeText(devDocContent)}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                <Copy className="w-3 h-3" />
              </button>
              <button disabled={!devDocDirty || devDocSaving} onClick={handleSaveDevDoc}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 disabled:opacity-40">
                {devDocSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : null} 保存
              </button>
            </>
          ) : (
            <>
              {isDirty && <span className="text-xs text-yellow-500">未保存</span>}
              <button onClick={handleCopy}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-[var(--color-border)] hover:bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                <Copy className="w-3 h-3" />
              </button>
              <button disabled={!isDirty || saving} onClick={handleSave}
                className="flex items-center gap-1 px-2.5 py-1 text-xs rounded bg-[var(--color-primary)] text-white hover:opacity-90 disabled:opacity-40">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : null} 保存
              </button>
            </>
          )}
        </div>
      </div>

      {/* ─── 内容区（根据 panelMode 切换） ─── */}
      <div className="flex-1 flex overflow-hidden">

        {/* PRD 全屏 */}
        {panelMode === 'prd' && (
          <div className="flex-1 flex overflow-hidden">
            {(prdViewMode === 'split' || prdViewMode === 'edit') && (
              <div className={`${prdViewMode === 'split' ? 'w-1/2 border-r border-[var(--color-border)]' : 'w-full'} h-full overflow-hidden`}>
                <Suspense fallback={<div className="p-4 text-sm text-[var(--color-muted-foreground)]">加载编辑器…</div>}>
                  <MarkdownEditor value={content} onChange={handleChange} onSave={handleSave} />
                </Suspense>
              </div>
            )}
            {(prdViewMode === 'split' || prdViewMode === 'preview') && (
              <div className={`${prdViewMode === 'split' ? 'w-1/2' : 'w-full'} h-full flex overflow-hidden`}>
                {/* 预览模式：大纲 + 内容 */}
                <DocOutline content={content} targetRef={prdPreviewRef} />
                <div className="flex-1 h-full overflow-hidden">
                  <MarkdownViewer content={content} viewRef={prdPreviewRef} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* 开发文档全屏（支持 split/edit/preview 子模式） */}
        {panelMode === 'dev' && (
          <div className="flex-1 overflow-hidden flex flex-col">
            {devDocStreaming ? (
              /* 生成中：实时预览 */
              <div className="flex-1 overflow-hidden">
                <MarkdownViewer content={devDocContent || '正在生成开发文档，Claude 正在读取知识图谱…'} />
              </div>
            ) : devDocContent ? (
              /* 有内容：分栏/编辑/预览 */
              <div className="flex-1 flex overflow-hidden">
                {(devViewMode === 'split' || devViewMode === 'edit') && (
                  <div className={`${devViewMode === 'split' ? 'w-1/2 border-r border-[var(--color-border)]' : 'w-full'} h-full overflow-hidden`}>
                    <Suspense fallback={<div className="p-4 text-sm text-[var(--color-muted-foreground)]">加载编辑器…</div>}>
                      <MarkdownEditor
                        value={devDocContent}
                        onChange={(v) => { setDevDocContent(v); setDevDocDirty(true) }}
                        onSave={handleSaveDevDoc}
                      />
                    </Suspense>
                  </div>
                )}
                {(devViewMode === 'split' || devViewMode === 'preview') && (
                  <div className={`${devViewMode === 'split' ? 'w-1/2' : 'w-full'} h-full flex overflow-hidden`}>
                    {/* 预览模式：大纲 + 内容 */}
                    <DocOutline content={devDocContent} targetRef={devPreviewRef} />
                    <div className="flex-1 h-full overflow-hidden">
                      <MarkdownViewer content={devDocContent} viewRef={devPreviewRef} />
                    </div>
                  </div>
                )}
              </div>
            ) : devDocLoading ? (
              /* 已知有开发文档，正在从后端读取内容（区别于「还没有开发文档」，避免误闪生成按钮） */
              <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--color-muted-foreground)]">
                <Loader2 className="w-6 h-6 animate-spin opacity-40" />
                <p className="text-sm opacity-70">正在加载开发文档…</p>
              </div>
            ) : (
              /* 无内容：引导生成 */
              <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--color-muted-foreground)]">
                <Wrench className="w-10 h-10 opacity-15" />
                <div className="text-center">
                  <p className="font-medium mb-1">还没有开发文档</p>
                  <p className="text-sm opacity-70">Claude 会先查知识图谱，再生成精准的技术方案</p>
                </div>
                <button onClick={() => setGenDevDocMode('generate')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600/15 border border-purple-500/20 text-purple-400 hover:bg-purple-600/25 text-sm font-medium">
                  <Wrench className="w-4 h-4" /> 生成开发文档
                </button>
              </div>
            )}
          </div>
        )}

        {/* 并排：PRD 左 50% | 开发文档 右 50% */}
        {panelMode === 'side' && (
          <>
            <div className="w-1/2 border-r border-[var(--color-border)] overflow-hidden flex flex-col">
              <div className="px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-muted)]/20 text-[10px] font-semibold text-[var(--color-muted-foreground)] flex items-center gap-1">
                <FileText className="w-3 h-3" /> PRD
              </div>
              <div className="flex-1 overflow-hidden">
                <MarkdownViewer content={content} />
              </div>
            </div>
            <div className="w-1/2 overflow-hidden flex flex-col">
              <div className="px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-muted)]/20 text-[10px] font-semibold text-purple-400 flex items-center gap-1">
                <Wrench className="w-3 h-3" /> 开发文档
                {devDocStreaming && <Loader2 className="w-2.5 h-2.5 animate-spin ml-1" />}
              </div>
              <div className="flex-1 overflow-hidden">
                {devDocContent ? (
                  <MarkdownViewer content={devDocContent} />
                ) : devDocStreaming ? (
                  <MarkdownViewer content="正在生成…" />
                ) : devDocLoading ? (
                  <div className="flex items-center justify-center h-full text-sm text-[var(--color-muted-foreground)]">
                    <Loader2 className="w-4 h-4 animate-spin mr-1.5" />正在加载…
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-[var(--color-muted-foreground)]">
                    <button onClick={() => setGenDevDocMode('generate')} className="text-purple-400 hover:underline">
                      生成开发文档
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ───── 主页面 ─────
export function PrdClarifyPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [step, setStep] = useState<PrdStep>('INPUT')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionTitle, setSessionTitle] = useState('')
  const [streamText, setStreamText] = useState('')
  const [prdContent, setPrdContent] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [generationFailed, setGenerationFailed] = useState(false)  // GENERATING 失败，留在当前步骤显示重试
  const [showClarifyHistory, setShowClarifyHistory] = useState(false) // 查看澄清记录抽屉
  const abortRef = useRef<(() => void) | null>(null)
  // GENERATING 阶段用 ref 积累全文，done 时一次性赋值（避免双重 setState）
  const prdAccRef = useRef('')
  // 从 ChattingPanel 拿到的完整 QA history，用于 generate 时读取
  const qaHistoryRef = useRef<QaPair[]>([])
  // 来自需求管理池时，记录来源标题，用于顶部上下文条
  const [reqContextTitle, setReqContextTitle] = useState<string | null>(null)
  // 防止自动启动多次执行
  const autoStartedRef = useRef(false)
  /**
   * reqItemId 持久化到 ref：URL 参数被 setSearchParams({}) 清除后，
   * 闭包里的 urlReqItemId 会变 ''，导致 startGenerateSse 里的判断失效。
   * 用 ref 在 URL 清除前锁住值，整个会话周期内有效。
   */
  const reqItemIdRef = useRef('')
  /** 正在发起修订的原始会话（显示 ReviseDialog） */
  const [revisingSesion, setRevisingSession] = useState<PrdSessionView | null>(null)

  // 读取 URL 参数
  const urlTitle = searchParams.get('title') ?? ''
  const urlRawInput = searchParams.get('rawInput') ?? ''
  const urlProject = searchParams.get('project') ?? ''
  const urlModule = searchParams.get('module') ?? ''
  /** 来自需求管理池的回写 ID（读取一次，后续用 reqItemIdRef） */
  const urlReqItemId = searchParams.get('reqItemId') ?? ''
  /** 直接查看某个历史 PRD 会话（来自需求管理池「查看PRD」按钮） */
  const urlViewSession = searchParams.get('viewSession') ?? ''

  // 来自需求管理池（有 reqItemId + 内容）：自动建会话、跳过 INPUT 直接开始澄清
  // 用 ref 保证只执行一次，不因其他 state 变化重触
  useEffect(() => {
    if (autoStartedRef.current) return
    if (!urlReqItemId || !urlTitle || !urlRawInput) return
    autoStartedRef.current = true
    reqItemIdRef.current = urlReqItemId  // ★ 在 URL 清除前锁住 reqItemId
    setReqContextTitle(urlTitle)
    createMut.mutateAsync({ title: urlTitle, rawInput: urlRawInput, project: urlProject, module: urlModule, role: 'PRODUCT' })
      .then((created) => {
        setSessionId(created.id)
        setSessionTitle(urlTitle)
        setSearchParams({}, { replace: true })  // URL 清除，但 reqItemIdRef 已保存
        qc.invalidateQueries({ queryKey: ['prd-sessions'] })
        setStep('CHATTING')
      })
      .catch(() => {
        autoStartedRef.current = false  // 创建失败可重试
        setErrorMsg('会话创建失败，请重试')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])  // 只在 mount 时执行一次

  // viewSession 参数：直接拉取会话内容并跳转到编辑器
  useEffect(() => {
    if (!urlViewSession) return
    setSearchParams({}, { replace: true })
    setSessionId(urlViewSession)
    getContent(urlViewSession)
      .then((content) => {
        setPrdContent(content ?? '')
        setStep('EDITING')
      })
      .catch(() => {
        setErrorMsg('读取 PRD 文件失败')
        setStep('INPUT')
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlViewSession])

  // 当前会话详情
  const { data: session } = useQuery({
    queryKey: ['prd-session', sessionId],
    queryFn: () => getSession(sessionId!),
    enabled: !!sessionId && step !== 'EDITING',
    refetchInterval: false,
  })

  // 历史列表
  const { data: sessions = [] } = useQuery({
    queryKey: ['prd-sessions'],
    queryFn: listSessions,
  })

  // 创建会话 mutation
  const createMut = useMutation({ mutationFn: createSession })

  // 删除 mutation
  const deleteMut = useMutation({
    mutationFn: deleteSession,
    onSuccess: (_data, deletedId) => {
      qc.invalidateQueries({ queryKey: ['prd-sessions'] })
      // 只有删的是当前激活的会话才 reset，避免删历史条目时中断正在进行的工作
      if (sessionId === deletedId) {
        handleReset()
      }
    },
  })

  const handleReset = () => {
    abortRef.current?.()
    abortRef.current = null
    setStep('INPUT')
    setSessionId(null)
    setStreamText('')
    setPrdContent('')
    setErrorMsg(null)
    setGenerationFailed(false)
    setReqContextTitle(null)
    autoStartedRef.current = false
    reqItemIdRef.current = ''
  }

  /**
   * 基于已有 PRD 生成修订版：
   * 1. 读取原版 PRD 内容
   * 2. 创建新会话，rawInput = [原PRD内容 + 修订说明]，title 加版本标记
   * 3. 直接进入 CHATTING（跳过 INPUT 表单）
   */
  const handleReviseConfirm = async (originalSession: PrdSessionView, changeDesc: string) => {
    setRevisingSession(null)
    setErrorMsg(null)
    try {
      // 读取原版 PRD 内容
      const prdText = await getContent(originalSession.id)
      const revisionRawInput = [
        `【修订版 PRD — 基于原版：${originalSession.title}】`,
        '',
        '=== 原版 PRD 内容 ===',
        prdText || '（原版内容读取失败）',
        '=== 本次修订说明 ===',
        changeDesc.trim() || '（未填写修订说明，请在澄清对话中补充）',
      ].join('\n')

      const newTitle = `${originalSession.title}（修订版）`
      const created = await createMut.mutateAsync({
        title: newTitle,
        rawInput: revisionRawInput,
        project: originalSession.project ?? '',
        module: originalSession.module ?? '',
        role: (originalSession.role as 'PRODUCT' | 'BUSINESS') ?? 'PRODUCT',
      })
      setSessionId(created.id)
      setSessionTitle(newTitle)
      setReqContextTitle(`修订自：${originalSession.title}`)
      qc.invalidateQueries({ queryKey: ['prd-sessions'] })
      setStep('CHATTING')
    } catch {
      setErrorMsg('创建修订版会话失败，请重试')
    }
  }

  /**
   * Step INPUT → 创建会话 → 进入多轮对话澄清。
   *
   * reqType/maxQuestions 不传时（业务员角色，未弹 StartClarifyDialog）故意不给默认值——
   * 让请求体里这两个字段真正缺失，后端据此触发 LLM 自动判定（而不是静默按 NEW_MODULE
   * 处理，那样等于假装"判断"了，其实只是抄了个默认值）。
   */
  const handleStart = async (
    title: string, rawInput: string, project: string, module: string,
    role: 'PRODUCT' | 'BUSINESS' = 'PRODUCT', reqType?: PrdReqType, maxQuestions?: number,
  ) => {
    setErrorMsg(null)
    setSessionTitle(title)
    setSearchParams({}, { replace: true })
    const created = await createMut.mutateAsync({ title, rawInput, project, module, role, reqType, maxQuestions })
    setSessionId(created.id)
    setStreamText('')
    qc.invalidateQueries({ queryKey: ['prd-sessions'] })
    setStep('CHATTING')   // 直接进入对话澄清（ChattingPanel 挂载后自动开始第一题）
  }

  /**
   * Vibe Coding 模式澄清：创建会话后，通过 sessionStorage handoff 跳转 claude-chat。
   * Claude 在 Vibe Coding 完整 UI 中执行 feature-dev Phase 3（工具调用完全可见），
   * 澄清完成后写入 PRD 文件，用户返回时触发 check-prd-file 更新状态。
   */
  const handleStartVibe = async (
    title: string, rawInput: string, project: string, module: string,
    role: 'PRODUCT' | 'BUSINESS' = 'PRODUCT', reqType?: PrdReqType, maxQuestions?: number,
  ) => {
    setErrorMsg(null)
    setSessionTitle(title)
    setSearchParams({}, { replace: true })

    // 创建会话（用于记录 prd_session_id，PRD 文件路径由此确定）
    const created = await createMut.mutateAsync({ title, rawInput, project, module, role, reqType, maxQuestions })
    setSessionId(created.id)
    qc.invalidateQueries({ queryKey: ['prd-sessions'] })

    // 查询项目 cwd
    let cwd = ''
    if (project) {
      try {
        const res = await fetch('/api/claude-chat/workspaces', {
          headers: { Authorization: `Bearer ${localStorage.getItem('toolbox.auth.token') ?? ''}` },
        })
        if (res.ok) {
          const data = await res.json() as { roots: Array<{ exists: boolean; dirs: Array<{ name: string; path: string }> }> }
          for (const root of data.roots ?? []) {
            const found = root.dirs?.find(d => d.name === project)
            if (found) { cwd = found.path; break }
          }
        }
      } catch { /* cwd 解析失败时留空 */ }
    }

    // 构建 seed 消息：feature-dev Phase 3 + 指示写 PRD 文件。
    // reqType/maxQuestions 一律读 created（后端返回的最终解析结果）而非入参本身——
    // 业务员角色没传这两个字段，入参是 undefined，此时已由后端 LLM 自动判定并写回 created。
    const prdPath = `~/.kai-toolbox/prd/${created.id}.md`
    const roleDesc = role === 'BUSINESS' ? '业务人员视角（聚焦业务价值，不讲技术细节）' : '产品/开发视角（可问技术约束、边界条件）'
    const resolvedReqType = created.reqType
    const resolvedMaxQuestions = created.maxQuestions
    const reqTypeLabel = REQ_TYPE_CONFIG[resolvedReqType].label
    // Bug 修复走极简问题清单 + 缺陷修复说明结构；模块调整/新增模块走标准 PRD 9 节结构
    const docGuide = resolvedReqType === 'BUG_FIX'
      ? '只问复现步骤、期望-实际行为落差、影响范围，不问业务目标/使用场景；产出「缺陷修复说明」（问题描述/复现步骤/根因/修复方案/影响范围/验收标准），不是标准 PRD'
      : '产出标准 PRD（文档概述/业务背景/目标用户/功能范围/功能需求/非功能需求/数据模型/验收标准/开放问题共 9 节）'
    const seed = `本次任务：执行 feature-dev:feature-dev Phase 3 (Clarifying Questions) — 需求澄清

[项目信息]
标题：${title}
项目：${project || '未指定'}
模块：${module || '未指定'}
澄清视角：${roleDesc}
需求类型：${reqTypeLabel}（${docGuide}）${reqType ? '' : '（由系统自动判定）'}

[原始需求]
${rawInput}

[执行要求]
1. 了解现有系统，两类知识来源分开处理：
   a. 业务语义（domain-knowledge / cross-topology）：通过 MCP 工具查询（mcp__domain-knowledge__search_knowledge、
      mcp__cross-topology__search_knowledge，若可用）
   b. 代码知识图谱（graphify）：不使用 MCP，直接用 Bash 执行 CLI —— 先判断当前目录是否为多项目容器：
      - 检查当前工作目录下是否存在 graphify-out/graph.json；若存在，直接在当前目录执行
        graphify query "<问题>"
      - 若不存在，说明当前目录是聚合了多个子项目的容器目录，改为列出一级子目录，找到其中
        含 graphify-out/graph.json 的子项目（可结合上面的"模块"信息定位到具体子项目），
        cd 进该子项目目录后再执行 graphify query "<问题>"
      - 两种情况都找不到图谱时，跳过这一步，直接基于原始需求澄清即可，不要虚构图谱内容
2. 基于以上背景进行多轮需求澄清对话（引用真实代码实体提问，最多 ${resolvedMaxQuestions} 轮；
   信息已足够时提前结束，不要为了凑轮数硬问）
3. 澄清完成后，按需求类型对应的文档结构生成完整文档（见上方"需求类型"括号说明），并写入文件：
   ${prdPath}
4. 写入成功后输出：PRD_SAVED: ${created.id}

PRD_SESSION_ID: ${created.id}`

    sessionStorage.setItem(PRD_CLARIFY_LAUNCH_KEY, JSON.stringify({ cwd, seed, prdSessionId: created.id }))
    navigate('/tools/claude-chat')
  }

  /**
   * 启动 PRD 生成 SSE，可复用于初次生成和重试。
   * 不改变 step（调用方负责设置 GENERATING）。
   */
  const startGenerateSse = (sid: string) => {
    setGenerationFailed(false)
    setStreamText('')
    prdAccRef.current = ''

    const abort = startGenerate(sid, {
      onEvent(name, data) {
        if (name === 'chunk') {
          const chunk = (data as { content: string }).content ?? ''
          prdAccRef.current += chunk
          setStreamText((t) => t + chunk)
        }
        if (name === 'done') {
          setPrdContent(prdAccRef.current)
          qc.invalidateQueries({ queryKey: ['prd-sessions'] })

          // 使用 ref 而非 urlReqItemId（URL 已被 setSearchParams({}) 清除，闭包值会是 ''）
          const savedReqItemId = reqItemIdRef.current

          if (savedReqItemId) {
            // 来自需求管理池：回写 PRD_READY 状态
            linkPrdToReqItem(savedReqItemId, sid)
              .then(() => setErrorMsg(null))
              .catch(() => setErrorMsg('PRD 已生成，但同步到需求管理池失败，请在需求池手动更新状态'))
          } else {
            // 独立创建的 PRD：自动在需求管理池注册
            getSession(sid)
              .then(s => autoRegisterToReqPool({
                title: s.title,
                project: s.project ?? '',
                module: s.module ?? '',
                prdSessionId: sid,
              }))
              .then(() => {
                qc.invalidateQueries({ queryKey: ['reqpool'] })
              })
              .catch(() => setErrorMsg('PRD 已生成，但自动登记到需求管理池失败（可手动到需求池查看）'))
          }
          setStep('EDITING')
        }
        if (name === 'error') {
          const d = data as { message: string }
          setErrorMsg(d.message ?? 'PRD 生成失败，可点击重试')
          // 不改 step！保持 GENERATING 步骤，显示重试按钮
          setGenerationFailed(true)
        }
      },
      onError() {
        setErrorMsg('SSE 连接失败，请点击重试')
        setGenerationFailed(true)
      },
    })
    abortRef.current = abort
  }

  /**
   * ChattingPanel 完成所有轮次后回调。
   * 1. 保存问答历史到数据库
   * 2. 启动 SSE 生成 PRD
   */
  const handleChattingDone = async (history: QaPair[]) => {
    if (!sessionId) return
    setErrorMsg(null)
    setGenerationFailed(false)
    qaHistoryRef.current = history

    try {
      await saveQaHistory(sessionId, history)
    } catch {
      // 保存失败不阻断流程
    }

    setStep('GENERATING')
    startGenerateSse(sessionId)
  }

  /** 重试 PRD 生成（超时/失败后用户点击重试） */
  const handleRetryGenerate = () => {
    if (!sessionId) return
    setErrorMsg(null)
    startGenerateSse(sessionId)
  }

  /** 从历史记录恢复会话（_openDevDoc=true 时自动打开开发文档分栏） */
  const handleSelectHistory = (s: PrdSessionView & { _openDevDoc?: boolean; _regenDevDoc?: boolean }) => {
    abortRef.current?.()
    abortRef.current = null
    setSessionId(s.id)
    setStreamText('')
    setErrorMsg(null)

    if (s.status === 'DONE') {
      getContent(s.id)
        .then((content) => {
          setPrdContent(content ?? '')
          setStep('EDITING')
          // _regenDevDoc=true：进入编辑器后立即触发重新生成开发文档
          if ((s as { _regenDevDoc?: boolean })._regenDevDoc) {
            // 通过 sessionId 在 EditingPanel 里监听，不在这里直接触发（需要 devDocContent 等状态）
            // 用 setTimeout 等 EditingPanel 挂载后再发信号
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('prd-clarify:regen-dev-doc', { detail: { sessionId: s.id } }))
            }, 300)
          }
        })
        .catch(() => {
          setPrdContent('')
          setStep('EDITING')
          setErrorMsg('PRD 文件读取失败，可点击「开始开发」使用当前编辑器内容，或重新生成')
        })
    } else if (s.status === 'CLARIFYING') {
      setStep('CHATTING')   // 重新进入对话澄清（会从头开始，历史在 DB 里但前端重新问）
    } else if (s.status === 'GENERATING') {
      setStep('GENERATING')
    } else if (s.status === 'ERROR') {
      setErrorMsg(s.errorMsg ?? '上次执行出错')
      setStep('INPUT')
    } else {
      setStep('INPUT')
    }
  }

  // 澄清记录：优先从 session.questions 读取（已持久化），降级用 qaHistoryRef
  const clarifyQuestions: QuestionItem[] = session?.questions?.length
    ? session.questions
    : qaHistoryRef.current.map((qa, i) => ({ id: i + 1, question: qa.question, answer: qa.answer }))

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[var(--color-background)]">
      {/* 步骤条：在第 3 步时，第 2 步可点击查看澄清记录 */}
      <StepBar
        step={step}
        onClickStep={(idx) => {
          if (idx === 1) setShowClarifyHistory(true)  // 点击第 2 步 → 打开澄清记录抽屉
        }}
      />

      {/* 澄清记录抽屉 */}
      {showClarifyHistory && (
        <ClarifyHistorySheet
          questions={clarifyQuestions}
          onClose={() => setShowClarifyHistory(false)}
        />
      )}

      {/* 来自需求管理池的上下文条 */}
      {reqContextTitle && step !== 'INPUT' && (
        <div className="flex items-center gap-2 px-5 py-1.5 bg-[var(--color-primary)]/8 border-b border-[var(--color-primary)]/15 text-xs text-[var(--color-primary)]">
          <Layers className="w-3 h-3 flex-shrink-0" />
          <span>来自需求管理池：<strong>{reqContextTitle}</strong></span>
          <button
            onClick={() => navigate('/tools/reqpool')}
            className="ml-auto underline opacity-70 hover:opacity-100"
          >
            返回需求池
          </button>
        </div>
      )}

      {/* 错误提示 */}
      {errorMsg && (
        <div className="flex items-center gap-2 px-6 py-2 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm border-b border-red-200 dark:border-red-900">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-xs underline">关闭</button>
        </div>
      )}

      {/* 修订版 Dialog */}
      {revisingSesion && (
        <ReviseDialog
          original={revisingSesion}
          onConfirm={(desc) => handleReviseConfirm(revisingSesion, desc)}
          onClose={() => setRevisingSession(null)}
        />
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* 历史侧边栏（非编辑器、非对话模式下显示） */}
        {step !== 'EDITING' && step !== 'CHATTING' && (
          <HistoryPanel
            sessions={sessions}
            activeId={sessionId}
            onSelect={handleSelectHistory}
            onDelete={(id) => deleteMut.mutate(id)}
            onRevise={(s) => setRevisingSession(s)}
          />
        )}

        {/* 主内容区 */}
        {step === 'INPUT' && (
          <InputPanel
            onStart={handleStart}
            onStartVibe={handleStartVibe}
            initialTitle={urlTitle}
            initialRawInput={urlRawInput}
            initialProject={urlProject}
            initialModule={urlModule}
          />
        )}

        {/* 多轮渐进澄清对话（ChattingPanel 自管理 askNextQuestion 循环） */}
        {step === 'CHATTING' && sessionId && (
          <ChattingPanel
            sessionId={sessionId}
            onDone={handleChattingDone}
            onError={(msg) => { setErrorMsg(msg); setStep('INPUT') }}
          />
        )}

        {step === 'GENERATING' && (
          <GeneratingPanel
            streamText={streamText}
            failed={generationFailed}
            onRetry={handleRetryGenerate}
          />
        )}

        {step === 'EDITING' && sessionId && (
          <EditingPanel
            sessionId={sessionId}
            sessionTitle={sessionTitle || session?.title || 'PRD 文档'}
            projectName={session?.project ?? urlProject ?? null}
            initialContent={prdContent}
            hasDevDoc={!!(session?.devDocPath)}
            isDevDocStale={
              !!(session?.devDocPath) &&
              (!session?.devDocGeneratedAt || session.devDocGeneratedAt < session.updatedAt)
            }
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  )
}
