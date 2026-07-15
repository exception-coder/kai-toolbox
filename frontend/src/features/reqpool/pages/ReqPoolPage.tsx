import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight, BookOpen, Code2, RefreshCw, Sparkles, Trash2,
} from 'lucide-react'
import {
  deleteItem, listItems, startClarify, syncFromPrd,
} from '../api'
import type { ReqItemView, ReqStatus } from '../types'
import { useConfirm } from '@/components/ui/confirm-dialog'

// ───── 常量 ─────

const STATUS_BADGE: Record<ReqStatus, { label: string; dot: string; text: string }> = {
  DRAFT:      { label: '草稿',    dot: 'bg-slate-400',  text: 'text-slate-500 dark:text-slate-400' },
  CLARIFYING: { label: '澄清中',  dot: 'bg-amber-400',  text: 'text-amber-600 dark:text-amber-400' },
  PRD_READY:  { label: 'PRD就绪', dot: 'bg-blue-500',   text: 'text-blue-600 dark:text-blue-400' },
  IN_DEV:     { label: '开发中',  dot: 'bg-purple-500', text: 'text-purple-600 dark:text-purple-400' },
  DONE:       { label: '已完成',  dot: 'bg-green-500',  text: 'text-green-600 dark:text-green-400' },
  CANCELLED:  { label: '已取消',  dot: 'bg-red-400',    text: 'text-red-400' },
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
  if (m < 60) return `${m} 分钟前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  return `${Math.floor(d / 30)} 个月前`
}

// ───── 单张需求卡片 ─────
function ReqCard({
  item,
  onClarify,
  onViewPrd,
  onDelete,
}: {
  item: ReqItemView
  onClarify: () => void
  onViewPrd: () => void
  onDelete: () => void
}) {
  const navigate = useNavigate()
  const badge = STATUS_BADGE[item.status]

  const handleCardClick = () => {
    if (item.prdSessionId) {
      onViewPrd()
    } else if (item.status === 'CLARIFYING') {
      onClarify()
    }
  }

  return (
    <div
      onClick={handleCardClick}
      className={`group relative rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]
        hover:border-[var(--color-primary)]/40 hover:shadow-md transition-all duration-200
        ${(item.prdSessionId || item.status === 'CLARIFYING') ? 'cursor-pointer' : ''}
        overflow-hidden`}
    >
      {/* 状态色条 */}
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${badge.dot} opacity-60`} />

      <div className="p-5">
        {/* 头部：标题 + 状态 */}
        <div className="flex items-start gap-3 mb-3">
          <Sparkles className="w-4 h-4 mt-0.5 flex-shrink-0 text-[var(--color-primary)] opacity-70" />
          <h3 className="flex-1 font-semibold text-[var(--color-foreground)] leading-snug text-sm">
            {item.title}
          </h3>
          <div className={`flex items-center gap-1.5 shrink-0 text-[11px] font-medium ${badge.text}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
            {badge.label}
          </div>
        </div>

        {/* 元信息 */}
        <div className="flex items-center gap-2 text-[11px] text-[var(--color-muted-foreground)] mb-4 ml-7">
          {item.project && <span className="bg-[var(--color-muted)]/60 px-1.5 py-0.5 rounded">{item.project}</span>}
          {item.module && <span className="bg-[var(--color-muted)]/60 px-1.5 py-0.5 rounded">{item.module}</span>}
          <span className="ml-auto">{timeAgo(item.updatedAt)}</span>
        </div>

        {/* 操作：默认隐藏，hover 显示 */}
        <div className="flex items-center gap-2 ml-7 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
             onClick={e => e.stopPropagation()}>

          {(item.status === 'DRAFT' || item.status === 'CLARIFYING') && (
            <button
              onClick={onClarify}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors font-medium"
            >
              <RefreshCw className="w-3 h-3" />
              {item.status === 'CLARIFYING' ? '继续澄清' : '开始澄清'}
            </button>
          )}

          {item.prdSessionId && (
            <button
              onClick={onViewPrd}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors font-medium"
            >
              <BookOpen className="w-3 h-3" />
              查看PRD
            </button>
          )}

          {item.status === 'PRD_READY' && (
            <button
              onClick={() => navigate('/tools/claude-chat')}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-lg bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/20 transition-colors font-medium"
            >
              <Code2 className="w-3 h-3" />
              开始开发
            </button>
          )}

          <button
            onClick={onDelete}
            className="ml-auto px-2 py-1 text-[11px] rounded-lg text-[var(--color-muted-foreground)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: items = [] } = useQuery({
    queryKey: ['reqpool', filter],
    queryFn: () => listItems(filter ? { status: filter } : undefined),
  })

  const syncMut = useMutation({
    mutationFn: syncFromPrd,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reqpool'] }),
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

  // textarea 自动高度
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
  }

  const handleStartClarify = () => {
    if (!input.trim()) return
    const title = input.trim().slice(0, 80)
    const params = new URLSearchParams({
      title,
      rawInput: input.trim(),
    })
    navigate(`/tools/prd-clarify?${params.toString()}`)
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
    if (item.prdSessionId) {
      navigate(`/tools/prd-clarify?viewSession=${item.prdSessionId}`)
    }
  }

  const handleDelete = async (item: ReqItemView) => {
    const ok = await confirm({
      title: '删除需求',
      description: `确认删除「${item.title}」？`,
      variant: 'destructive',
    })
    if (ok) deleteMut.mutate(item.id)
  }

  const filtered = items  // 已由 API 按 status 过滤

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-background)]">
      {/* ── Hero 输入区 ── */}
      <div className="px-8 pt-10 pb-8 border-b border-[var(--color-border)]">
        <div className="max-w-2xl">
          <h1 className="text-xl font-bold text-[var(--color-foreground)] mb-1">
            今天想实现什么？
          </h1>
          <p className="text-sm text-[var(--color-muted-foreground)] mb-5">
            描述你的想法，AI 会帮你澄清需求并生成 PRD
          </p>

          <div className="relative flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 focus-within:border-[var(--color-primary)]/50 focus-within:shadow-md transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleStartClarify()
              }}
              placeholder="例如：给用户权限模块增加角色继承功能，支持多级权限树..."
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

      {/* ── 过滤标签 + 状态 ── */}
      <div className="flex items-center gap-2 px-8 py-4">
        <span className="text-xs font-medium text-[var(--color-muted-foreground)] mr-1">筛选</span>
        {FILTER_TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setFilter(t.value as ReqStatus | '')}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              filter === t.value
                ? 'bg-[var(--color-primary)] text-white'
                : 'bg-[var(--color-muted)]/50 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)]'
            }`}
          >
            {t.label}
          </button>
        ))}
        {syncMut.isPending && (
          <span className="ml-auto text-[11px] text-[var(--color-muted-foreground)] animate-pulse">
            同步中…
          </span>
        )}
        {!syncMut.isPending && items.length > 0 && (
          <span className="ml-auto text-[11px] text-[var(--color-muted-foreground)]">
            {items.length} 条需求
          </span>
        )}
      </div>

      {/* ── 卡片流 ── */}
      <div className="px-8 pb-12">
        {filtered.length === 0 && !syncMut.isPending ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-[var(--color-muted-foreground)]">
            <Sparkles className="w-10 h-10 opacity-15" />
            <p className="text-sm font-medium">
              {filter ? `暂无「${FILTER_TABS.find(t => t.value === filter)?.label}」状态的需求` : '还没有需求记录'}
            </p>
            {!filter && (
              <p className="text-xs opacity-70">在上方输入框描述你的想法，开启第一个 AI 澄清</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.map(item => (
              <ReqCard
                key={item.id}
                item={item}
                onClarify={() => handleClarifyItem(item)}
                onViewPrd={() => handleViewPrd(item)}
                onDelete={() => handleDelete(item)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
