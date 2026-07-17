import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { BotMessageSquare, ChevronRight, Code2, Copy, ExternalLink, FileText, GitBranch, Info, Layers, Loader2, Paperclip, Plus, RefreshCw, Rocket, Send, Trash2, User, Wrench, X } from 'lucide-react'
import { http } from '@/lib/api'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
// doc-viewer 的 markdown.css 含完整 prose 样式（标题层级/代码块/表格等），无需 @tailwindcss/typography
import '@/features/doc-viewer/styles/markdown.css'
import {
  askNextQuestion,
  autoRegisterToReqPool,
  createSession,
  deleteSession,
  getContent,
  getDevDocContent,
  getSession,
  linkPrdToReqItem,
  listSessions,
  parseAttachment,
  saveContent,
  saveDevDocContent,
  saveQaHistory,
  startGenerate,
  startGenerateDevDoc,
  type QaPair,
  type AttachmentParseResult,
} from '../api'
import type { PrdSessionView, PrdStep, QuestionItem } from '../types'
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
            <span className="font-semibold text-sm">澄清问答记录</span>
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
          此记录已纳入 PRD 生成，关闭后可继续编辑文档
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
                </div>

                {/* 树结构：开发文档作为 PRD 的子节点 */}
                {s.devDocPath && (
                  <div className="flex items-center gap-1 mt-1.5">
                    {/* 树连接线 */}
                    <div className="flex items-center flex-shrink-0 text-[var(--color-border)]">
                      <div className="w-2.5 h-[1px] border-l border-b border-dashed border-[var(--color-muted-foreground)]/30 rounded-bl" style={{ width: 10, height: 8, borderWidth: '0 0 1px 1px' }} />
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelect({ ...s, _openDevDoc: true } as PrdSessionView & { _openDevDoc?: boolean })
                      }}
                      className="flex items-center gap-1 text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
                      title="查看开发文档"
                    >
                      <Wrench className="w-2.5 h-2.5" />
                      开发文档
                    </button>
                  </div>
                )}
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
  initialTitle = '',
  initialRawInput = '',
  initialProject = '',
  initialModule = '',
}: {
  onStart: (title: string, rawInput: string, project: string, module: string, role: 'PRODUCT' | 'BUSINESS') => void
  initialTitle?: string
  initialRawInput?: string
  initialProject?: string
  initialModule?: string
}) {
  const [title, setTitle] = useState(initialTitle)
  const [rawInput, setRawInput] = useState(initialRawInput)
  const [project, setProject] = useState(initialProject)
  const [module, setModule] = useState(initialModule)
  const [role, setRole] = useState<'PRODUCT' | 'BUSINESS'>('PRODUCT')
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
            {/* input+datalist：预填值永远生效，项目列表作为候选提示 */}
            <input
              id="project-input"
              list="project-datalist"
              value={project}
              onChange={(e) => { setProject(e.target.value); setModule('') }}
              placeholder="如：kai-toolbox（可手动输入）"
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
            />
            <datalist id="project-datalist">
              {projects.map((p) => (
                <option key={p.name} value={p.name} />
              ))}
            </datalist>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1">关联模块（可选）</label>
            {/* 改用 input+datalist：预填值（来自 URL 参数）永远生效，加载到的模块作为候选提示 */}
            <input
              id="module-input"
              list="module-datalist"
              value={module}
              onChange={(e) => setModule(e.target.value)}
              placeholder="如：tool-reqpool（可手动输入）"
              className="w-full px-3 py-2 rounded-md border border-[var(--color-border)] bg-[var(--color-input)] text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-ring)]"
            />
            <datalist id="module-datalist">
              {modules.map((m) => (
                <option key={m.name} value={m.name} />
              ))}
            </datalist>
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

        <button
          disabled={!canSubmit}
          onClick={() => onStart(title.trim(), buildFinalRawInput(), project, module, role)}
          className="w-full py-2.5 rounded-md bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
        >
          {role === 'BUSINESS' ? '开始描述我的业务需求' : '开始需求澄清'}
        </button>
      </div>
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
      // 有开发文档：直接按方案实现，无需 Claude 再做技术分析
      return `【开发方案文档】${title}

---

${devDocContent}

---

以上是已完成 AI 分析的技术开发方案文档，请直接按方案实现：

1. 按「实现步骤（有序任务清单）」逐项完成，勿跳过顺序
2. 按「数据库变更」章节执行 DDL/ALTER（注意幂等）
3. 按「API 接口设计」章节实现接口
4. 每个任务完成后报告进度，有疑问先问再做

PRD_SESSION_ID: ${sessionId}`
    }

    // 无开发文档：带 PRD + feature-dev 引导流程
    return `[PRD] ${title}

---

${content}

---

请按以下步骤执行需求开发（/feature-dev 流程）：

**Step 1 — 理解需求**
认真阅读以上 PRD，理解功能边界、验收标准、技术约束。

**Step 2 — 代码库探索**
探索相关现有代码（Controller / Service / Repository / 前端组件），理解现有数据模型和 API。

**Step 3 — 设计技术方案**
基于 PRD 和现有代码输出：
- 数据库变更（完整 DDL/ALTER）
- API 接口设计（请求/响应结构）
- 前后端改动清单（精确到方法/组件级别）

**Step 4 — 实现**
按方案优先级逐步实现，每步完成后告知进度。完成后将技术方案文档保存到 \`docs/design/\` 目录。

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
  onReset,
}: {
  sessionId: string
  sessionTitle: string
  projectName: string | null
  initialContent: string
  /** 从历史加载时，该 PRD 是否已有开发文档（devDocPath 非空） */
  hasDevDoc?: boolean
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
  const [devDocDirty, setDevDocDirty] = useState(false)
  const [devDocSaving, setDevDocSaving] = useState(false)
  const devDocAbortRef = useRef<(() => void) | null>(null)
  const devDocAccRef = useRef('')

  const handleGenerateDevDoc = () => {
    setPanelMode('dev')   // 生成时切到开发文档全屏视图
    setDevDocContent('')
    setDevDocStreaming(true)
    devDocAccRef.current = ''
    devDocAbortRef.current?.()

    const abort = startGenerateDevDoc(sessionId, {
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

  // 进入 dev 或 side 模式时自动加载开发文档内容（只加载一次）
  useEffect(() => {
    if ((panelMode === 'prd') || devDocContent) return
    getDevDocContent(sessionId).then(c => { if (c) setDevDocContent(c) }).catch(() => {})
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

      {/* ─── 顶部 Tab + 操作栏 ─── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-card)] gap-2">

        {/* 左：文档 Tab 切换 */}
        <div className="flex items-center gap-0.5 bg-[var(--color-muted)]/40 rounded-lg p-0.5 text-xs">
          {([
            { key: 'prd', label: 'PRD', icon: <FileText className="w-3 h-3" /> },
            { key: 'dev', label: '开发文档', icon: <Wrench className="w-3 h-3" /> },
            { key: 'side', label: '并排', icon: null },
          ] as const).map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => {
                setPanelMode(key)
                if ((key === 'dev' || key === 'side') && !devDocContent && !devDocStreaming) {
                  // 切到开发文档时，若无内容则触发生成
                  handleGenerateDevDoc()
                }
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md transition-colors ${
                panelMode === key
                  ? key === 'dev'
                    ? 'bg-purple-600/20 text-purple-400 font-medium'
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
          {/* 重新生成按钮（开发文档 Tab 有内容时显示） */}
          {panelMode === 'dev' && devDocContent && !devDocStreaming && (
            <button onClick={handleGenerateDevDoc}
              className="ml-1 flex items-center gap-1 px-2 py-0.5 rounded text-[var(--color-muted-foreground)] hover:text-purple-400 hover:bg-purple-500/10 transition-colors"
              title="基于当前 PRD 重新生成开发文档（覆盖现有版本）">
              <RefreshCw className="w-3 h-3" /> 重新生成
            </button>
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
            ) : (
              /* 无内容：引导生成 */
              <div className="flex flex-col items-center justify-center h-full gap-4 text-[var(--color-muted-foreground)]">
                <Wrench className="w-10 h-10 opacity-15" />
                <div className="text-center">
                  <p className="font-medium mb-1">还没有开发文档</p>
                  <p className="text-sm opacity-70">Claude 会先查知识图谱，再生成精准的技术方案</p>
                </div>
                <button onClick={handleGenerateDevDoc}
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
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-[var(--color-muted-foreground)]">
                    <button onClick={handleGenerateDevDoc} className="text-purple-400 hover:underline">
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

  /** Step INPUT → 创建会话 → 进入多轮对话澄清 */
  const handleStart = async (title: string, rawInput: string, project: string, module: string, role: 'PRODUCT' | 'BUSINESS' = 'PRODUCT') => {
    setErrorMsg(null)
    setSessionTitle(title)
    setSearchParams({}, { replace: true })
    const created = await createMut.mutateAsync({ title, rawInput, project, module, role })
    setSessionId(created.id)
    setStreamText('')
    qc.invalidateQueries({ queryKey: ['prd-sessions'] })
    setStep('CHATTING')   // 直接进入对话澄清（ChattingPanel 挂载后自动开始第一题）
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
  const handleSelectHistory = (s: PrdSessionView & { _openDevDoc?: boolean }) => {
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
          // 点击了开发文档子节点 OR 会话本身有开发文档：自动打开右侧分栏
          // hasDevDoc prop 会触发 EditingPanel 内部 useState 初始化为 true
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
            onReset={handleReset}
          />
        )}
      </div>
    </div>
  )
}
