import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight, BookOpen, Code2, Loader2, RefreshCw, Sparkles, Zap,
} from 'lucide-react'
import {
  analyzeItem, deleteItem, listItems, portfolioAnalyze, startClarify, syncFromPrd,
} from '../api'
import type { ReqItemView, ReqStatus } from '../types'
import { useConfirm } from '@/components/ui/confirm-dialog'

// ───── 常量 ─────

const PRIORITY_CONFIG = {
  STRATEGIC: { label: 'Strategic',    badge: '战略级',  color: 'text-red-500',    bg: 'bg-red-500/8',    bar: 'bg-red-500',    stars: 5 },
  HIGH:      { label: 'High',         badge: '高优先',  color: 'text-orange-500', bg: 'bg-orange-500/8', bar: 'bg-orange-400', stars: 4 },
  MEDIUM:    { label: 'Medium',       badge: '可排期',  color: 'text-blue-500',   bg: 'bg-blue-500/8',   bar: 'bg-blue-400',   stars: 3 },
  LOW:       { label: 'Low',          badge: '可延期',  color: 'text-slate-400',  bg: 'bg-slate-500/8',  bar: 'bg-slate-400',  stars: 2 },
} as const

const STATUS_BADGE: Record<ReqStatus, { label: string; cls: string }> = {
  DRAFT:      { label: '草稿',    cls: 'bg-slate-100/60 text-slate-500 dark:bg-slate-700/40 dark:text-slate-400' },
  CLARIFYING: { label: '澄清中',  cls: 'bg-amber-100/60 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' },
  PRD_READY:  { label: 'PRD就绪', cls: 'bg-blue-100/60 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  IN_DEV:     { label: '开发中',  cls: 'bg-purple-100/60 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
  DONE:       { label: '已完成',  cls: 'bg-green-100/60 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
  CANCELLED:  { label: '已取消',  cls: 'bg-red-100/40 text-red-400 dark:bg-red-900/20 dark:text-red-400' },
}

const FILTER_TABS: Array<{ value: ReqStatus | ''; label: string }> = [
  { value: '', label: '全部' },
  { value: 'CLARIFYING', label: '澄清中' },
  { value: 'PRD_READY', label: 'PRD就绪' },
  { value: 'IN_DEV', label: '开发中' },
  { value: 'DONE', label: '已完成' },
]

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return '刚刚'
  if (m < 60) return `${m}分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}天前`
  return `${Math.floor(d / 30)}个月前`
}

// ───── AI Insight 解析 ─────
interface AiInsight {
  priority: 'STRATEGIC' | 'HIGH' | 'MEDIUM' | 'LOW'
  stars: number
  recommendation: string
  reason: string
  impacts: string[]
  roi: 'HIGH' | 'MEDIUM' | 'LOW'
  estimatedHours: number
  /** Portfolio 全局分析后的相对排名（1 = 最优先）；独立分析时无此字段 */
  rank?: number
  /** 与其他需求相比的差异点（Portfolio 分析后有） */
  comparedTo?: string
}

function parseInsight(json: string | null | undefined): AiInsight | null {
  if (!json) return null
  try {
    return JSON.parse(json) as AiInsight
  } catch {
    return null
  }
}

function Stars({ n, color }: { n: number; color: string }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className={`w-3 h-3 rounded-sm ${i < n ? color : 'bg-[var(--color-muted)]'}`} />
      ))}
    </div>
  )
}

// ───── AI Recommendation 展开区 ─────
function AiRecommendation({ insight, onAnalyze, analyzing }: {
  insight: AiInsight | null
  onAnalyze: () => void
  analyzing: boolean
}) {
  if (analyzing) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 border-t border-[var(--color-border)] text-[11px] text-[var(--color-muted-foreground)]">
        <Sparkles className="w-3 h-3 animate-pulse" />
        AI 正在分析价值…
      </div>
    )
  }

  if (!insight) {
    return (
      <button
        onClick={e => { e.stopPropagation(); onAnalyze() }}
        className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 border-t border-[var(--color-border)] text-[11px] text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-colors"
      >
        <Sparkles className="w-3 h-3" />
        AI 分析价值
      </button>
    )
  }

  const cfg = PRIORITY_CONFIG[insight.priority] ?? PRIORITY_CONFIG.MEDIUM
  const roiLabel = { HIGH: '高', MEDIUM: '中', LOW: '低' }[insight.roi] ?? insight.roi

  return (
    <div className={`border-t border-[var(--color-border)] ${cfg.bg}`}>
      {/* AI 推荐头部 */}
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div className="flex items-center gap-2">
          <Sparkles className={`w-3 h-3 ${cfg.color}`} />
          <span className={`text-[10px] font-bold uppercase tracking-wider ${cfg.color}`}>
            AI Recommendation
          </span>
        </div>
        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cfg.color} bg-current/10`}>
          {cfg.badge}
        </span>
      </div>

      {/* 星级 + 建议 */}
      <div className="px-4 pb-2">
        <Stars n={insight.stars} color={cfg.bar} />
        <p className={`text-xs font-semibold mt-1.5 ${cfg.color}`}>{insight.recommendation}</p>
        {insight.reason && (
          <p className="text-[11px] text-[var(--color-muted-foreground)] mt-0.5 leading-relaxed">
            {insight.reason}
          </p>
        )}
        {insight.comparedTo && (
          <p className="text-[10px] text-[var(--color-primary)]/60 mt-0.5 italic">
            ↔ {insight.comparedTo}
          </p>
        )}
      </div>

      {/* 影响范围 */}
      {insight.impacts && insight.impacts.length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-1">
            {insight.impacts.map((imp, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--color-muted)]/50 text-[var(--color-muted-foreground)]">
                {imp}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ROI + 工时 */}
      <div className="flex items-center gap-4 px-4 pb-3 text-[11px] text-[var(--color-muted-foreground)]">
        <span>ROI <strong className={cfg.color}>{roiLabel}</strong></span>
        {insight.estimatedHours > 0 && (
          <span>预计 <strong>{insight.estimatedHours}h</strong></span>
        )}
      </div>
    </div>
  )
}

// ───── 单张需求卡片 ─────
function ReqCard({
  item,
  onClarify,
  onViewPrd,
  onDelete,
  onAnalyze,
  analyzing,
}: {
  item: ReqItemView
  onClarify: () => void
  onViewPrd: () => void
  onDelete: () => void
  onAnalyze: () => void
  analyzing: boolean
}) {
  const navigate = useNavigate()
  const insight = parseInsight(item.aiInsight)
  const statusBadge = STATUS_BADGE[item.status]
  const priorityCfg = insight ? (PRIORITY_CONFIG[insight.priority] ?? PRIORITY_CONFIG.MEDIUM) : null

  const handleCardClick = (e: React.MouseEvent) => {
    if ((e.target as Element).closest('button')) return
    if (item.prdSessionId) onViewPrd()
    else if (item.status === 'CLARIFYING') onClarify()
  }

  return (
    <div
      onClick={handleCardClick}
      className={`group relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden
        hover:border-[var(--color-primary)]/30 hover:shadow-lg transition-all duration-200
        ${(item.prdSessionId || item.status === 'CLARIFYING') ? 'cursor-pointer' : ''}`}
    >
      {/* 优先级色条（顶部） */}
      <div className={`h-0.5 ${priorityCfg ? priorityCfg.bar : 'bg-[var(--color-border)]'}`} />

      {/* 主要内容区 */}
      <div className="p-4">
        {/* 标题行 */}
        <div className="flex items-start gap-2.5 mb-2.5">
          <Sparkles className={`w-4 h-4 mt-0.5 flex-shrink-0 ${priorityCfg ? priorityCfg.color : 'text-[var(--color-muted-foreground)]'} opacity-80`} />
          <h3 className="flex-1 text-sm font-semibold text-[var(--color-foreground)] leading-snug">
            {item.title}
          </h3>
          <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
        </div>

        {/* 元信息 */}
        <div className="flex items-center gap-1.5 ml-6.5 text-[11px] text-[var(--color-muted-foreground)]">
          {item.project && (
            <span className="px-1.5 py-0.5 rounded bg-[var(--color-muted)]/50">{item.project}</span>
          )}
          {item.module && (
            <span className="px-1.5 py-0.5 rounded bg-[var(--color-muted)]/50">{item.module}</span>
          )}
          <span className="ml-auto">{timeAgo(item.updatedAt)}</span>
        </div>

        {/* 操作按钮（hover 才显示） */}
        <div className="flex items-center gap-1.5 mt-3 ml-6 opacity-0 group-hover:opacity-100 transition-opacity"
             onClick={e => e.stopPropagation()}>
          {(item.status === 'DRAFT' || item.status === 'CLARIFYING') && (
            <button onClick={onClarify}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors font-medium">
              <RefreshCw className="w-3 h-3" />
              {item.status === 'CLARIFYING' ? '继续澄清' : '开始澄清'}
            </button>
          )}
          {item.prdSessionId && (
            <button onClick={onViewPrd}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors font-medium">
              <BookOpen className="w-3 h-3" /> 查看PRD
            </button>
          )}
          {item.status === 'PRD_READY' && (
            <button onClick={() => navigate('/tools/claude-chat')}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 transition-colors font-medium">
              <Code2 className="w-3 h-3" /> 开始开发
            </button>
          )}
          <button onClick={onDelete}
            className="ml-auto px-2 py-1 text-[11px] rounded-lg text-[var(--color-muted-foreground)] hover:text-red-500 hover:bg-red-500/10 transition-colors">
            ×
          </button>
        </div>
      </div>

      {/* AI Recommendation 区 */}
      <AiRecommendation insight={insight} onAnalyze={onAnalyze} analyzing={analyzing} />
    </div>
  )
}

// ───── AI Portfolio 顶部推荐条 ─────
function AiPortfolio({ items }: { items: ReqItemView[] }) {
  const topItems = items
    .filter(i => {
      const ins = parseInsight(i.aiInsight)
      return ins && (ins.priority === 'STRATEGIC' || ins.priority === 'HIGH')
    })
    .sort((a, b) => {
      const pa = parseInsight(a.aiInsight)
      const pb = parseInsight(b.aiInsight)
      if (!pa || !pb) return 0
      const order = { STRATEGIC: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
      return (order[pa.priority] ?? 3) - (order[pb.priority] ?? 3)
    })
    .slice(0, 3)

  if (topItems.length === 0) return null

  return (
    <div className="mx-8 mb-4 rounded-2xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--color-primary)]/10">
        <Zap className="w-4 h-4 text-[var(--color-primary)]" />
        <span className="text-xs font-bold text-[var(--color-primary)]">AI Portfolio · 建议本期优先</span>
      </div>
      <div className="flex gap-0 divide-x divide-[var(--color-primary)]/10">
        {topItems.map(item => {
          const ins = parseInsight(item.aiInsight)!
          const cfg = PRIORITY_CONFIG[ins.priority]
          return (
            <div key={item.id} className="flex-1 px-5 py-3 min-w-0">
              <div className={`text-[10px] font-bold uppercase tracking-wide ${cfg.color} mb-1`}>
                {cfg.badge}
              </div>
              <div className="text-xs font-semibold text-[var(--color-foreground)] truncate">{item.title}</div>
              <div className="text-[11px] text-[var(--color-muted-foreground)] mt-0.5 truncate">
                {ins.recommendation}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ───── 主页面 ─────
export function ReqPoolPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const [filter, setFilter] = useState<ReqStatus | ''>('')
  const [input, setInput] = useState('')
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set())
  const [portfolioSummary, setPortfolioSummary] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: items = [] } = useQuery({
    queryKey: ['reqpool', filter],
    queryFn: () => listItems(filter ? { status: filter } : undefined),
  })

  const syncMut = useMutation({
    mutationFn: syncFromPrd,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reqpool'] }),
  })

  const portfolioMut = useMutation({
    mutationFn: portfolioAnalyze,
    onSuccess: (data) => {
      setPortfolioSummary(data.summary)
      qc.invalidateQueries({ queryKey: ['reqpool'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: deleteItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reqpool'] }),
  })

  const clarifyMut = useMutation({
    mutationFn: startClarify,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reqpool'] }),
  })

  // 页面挂载时自动静默同步
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { syncMut.mutate() }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

  const handleStartClarify = () => {
    if (!input.trim()) return
    const title = input.trim().slice(0, 80)
    navigate(`/tools/prd-clarify?${new URLSearchParams({ title, rawInput: input.trim() }).toString()}`)
  }

  const handleClarifyItem = async (item: ReqItemView) => {
    await clarifyMut.mutateAsync(item.id)
    const params = new URLSearchParams({
      title: item.title,
      rawInput: item.description ?? '',
      project: item.project ?? '',
      module: item.module ?? '',
      reqItemId: item.id,
    })
    navigate(`/tools/prd-clarify?${params.toString()}`)
  }

  const handleViewPrd = (item: ReqItemView) => {
    if (item.prdSessionId) navigate(`/tools/prd-clarify?viewSession=${item.prdSessionId}`)
  }

  const handleDelete = async (item: ReqItemView) => {
    const ok = await confirm({
      title: '删除需求',
      description: `确认删除「${item.title}」？`,
      variant: 'destructive',
    })
    if (ok) deleteMut.mutate(item.id)
  }

  const handleAnalyze = async (item: ReqItemView) => {
    setAnalyzingIds(s => new Set(s).add(item.id))
    try {
      await analyzeItem(item.id)
      qc.invalidateQueries({ queryKey: ['reqpool'] })
    } finally {
      setAnalyzingIds(s => { const n = new Set(s); n.delete(item.id); return n })
    }
  }

  // 按 ai_insight.rank 排序（Portfolio 分析后有 rank 字段）；无 rank 的排到后面
  const sortedItems = [...items].sort((a, b) => {
    const ra = parseInsight(a.aiInsight)?.rank ?? 999
    const rb = parseInsight(b.aiInsight)?.rank ?? 999
    return ra - rb
  })

  const isEmpty = items.length === 0 && !syncMut.isPending

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-background)]">
      {/* ── Hero 输入区 ── */}
      <div className="px-8 pt-10 pb-8 border-b border-[var(--color-border)]">
        <div className="max-w-2xl">
          <h1 className="text-xl font-bold text-[var(--color-foreground)] mb-1">今天想实现什么？</h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mb-5">
            描述你的想法，AI 帮你澄清需求、生成 PRD，并分析业务价值
          </p>
          <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 focus-within:border-[var(--color-primary)]/50 focus-within:shadow-md transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleStartClarify() }}
              placeholder="例如：给用户权限模块增加角色继承功能，支持多级权限树…"
              rows={2}
              className="w-full bg-transparent text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] resize-none focus:outline-none leading-relaxed"
              style={{ minHeight: '2.5rem', maxHeight: '8rem' }}
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--color-muted-foreground)]">
                {input ? `${input.length} 字` : 'Ctrl+Enter 快速开始'}
              </span>
              <button
                disabled={!input.trim()}
                onClick={handleStartClarify}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--color-primary)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-30 transition-opacity"
              >
                <Sparkles className="w-3.5 h-3.5" />
                AI 开始澄清
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Portfolio 全局分析摘要（运行后显示） ── */}
      {portfolioSummary && (
        <div className="mx-8 mt-5 flex items-start gap-2.5 rounded-2xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 px-5 py-3">
          <Sparkles className="w-4 h-4 text-[var(--color-primary)] flex-shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-bold text-[var(--color-primary)] mr-2">AI 本期建议</span>
            <span className="text-xs text-[var(--color-foreground)]">{portfolioSummary}</span>
          </div>
          <button onClick={() => setPortfolioSummary(null)} className="ml-auto text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] text-lg leading-none">×</button>
        </div>
      )}

      {/* ── AI Portfolio 推荐 ── */}
      {items.length > 0 && (
        <div className="pt-5">
          <AiPortfolio items={sortedItems} />
        </div>
      )}

      {/* ── 过滤标签 ── */}
      <div className="flex items-center gap-2 px-8 py-3">
        <span className="text-xs text-[var(--color-muted-foreground)]">筛选</span>
        {FILTER_TABS.map(t => (
          <button key={t.value} onClick={() => setFilter(t.value as ReqStatus | '')}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              filter === t.value
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-muted)]/50 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]'
            }`}>
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {(syncMut.isPending || portfolioMut.isPending) && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-muted-foreground)]" />
          )}
          {/* Portfolio 全局排序按钮 */}
          <button
            onClick={() => portfolioMut.mutate()}
            disabled={portfolioMut.isPending || items.length === 0}
            className="flex items-center gap-1.5 px-3 py-1 text-[11px] rounded-full border border-[var(--color-primary)]/30 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 disabled:opacity-40 transition-colors font-medium"
            title="让 Claude 横向对比所有需求，给出本期最优开发顺序（约 30-60 秒）"
          >
            <Zap className="w-3 h-3" />
            {portfolioMut.isPending ? 'AI 分析中…' : 'AI 全局排序'}
          </button>
          {!syncMut.isPending && items.length > 0 && (
            <span className="text-[11px] text-[var(--color-muted-foreground)]">{items.length} 条</span>
          )}
        </div>
      </div>

      {/* ── 卡片流 ── */}
      <div className="px-8 pb-12">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--color-muted-foreground)]">
            <Sparkles className="w-10 h-10 opacity-15" />
            <p className="text-sm font-medium">还没有需求记录</p>
            <p className="text-xs opacity-70">在上方输入框描述你的想法，开启第一个 AI 澄清</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {sortedItems.map(item => (
              <ReqCard
                key={item.id}
                item={item}
                onClarify={() => handleClarifyItem(item)}
                onViewPrd={() => handleViewPrd(item)}
                onDelete={() => handleDelete(item)}
                onAnalyze={() => handleAnalyze(item)}
                analyzing={analyzingIds.has(item.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
