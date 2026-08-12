import { useMemo, useState } from 'react'
import {
  BookOpenCheck,
  ChevronDown,
  CircleHelp,
  Flame,
  Search,
  Target,
  Trophy,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { KnowledgeTreeNode } from '../api/knowledgeApi'
import type { LearningProfile } from '../lib/learningProfile'
import type { LearningRecord } from './KnowledgePlayer'
import { LearningProfileCard } from './LearningProfileCard'
import { KnowledgeTree } from './KnowledgeTree'

interface Props {
  nodes: KnowledgeTreeNode[]
  recommendedNodes: KnowledgeTreeNode[]
  filteredRecommendedNodes: KnowledgeTreeNode[]
  filteredAllNodes: KnowledgeTreeNode[]
  selectedId: string | null
  records: Record<string, LearningRecord>
  profile: LearningProfile
  search: string
  onProfileChange: (profile: LearningProfile) => void
  onSearchChange: (value: string) => void
  onSelect: (node: KnowledgeTreeNode) => void
  onContinue: () => void
}

export function LearningMapPanel({
  nodes,
  recommendedNodes,
  filteredRecommendedNodes,
  filteredAllNodes,
  selectedId,
  records,
  profile,
  search,
  onProfileChange,
  onSearchChange,
  onSelect,
  onContinue,
}: Props) {
  const [treeOpen, setTreeOpen] = useState(false)
  const stats = useMemo(() => buildLearningStats(recommendedNodes, records), [recommendedNodes, records])
  const allCount = useMemo(() => flattenReadableNodes(nodes).length, [nodes])

  return (
    <aside className="min-h-0 overflow-y-auto border-r border-[var(--color-border)]/70 bg-[var(--color-card)]/55">
      <div className="space-y-4 border-b border-[var(--color-border)]/70 p-4">
        <LearningProfileCard
          profile={profile}
          recommendedCount={stats.total}
          onChange={onProfileChange}
        />

        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Flame className="h-4 w-4 text-orange-500" />
            今日冲刺
          </div>
          <p className="mt-1 text-xs leading-5 text-[var(--color-muted-foreground)]">
            先处理薄弱点，再进入新知识。
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <StatCard icon={Target} value={stats.sprintRemaining} label="今日待学" tone="indigo" />
          <StatCard icon={CircleHelp} value={stats.weak} label="薄弱点" tone="amber" />
          <StatCard icon={BookOpenCheck} value={stats.reviewedToday} label="今日完成" tone="emerald" />
        </div>

        <button
          type="button"
          onClick={onContinue}
          disabled={stats.total === 0}
          className="group flex w-full items-center justify-between rounded-xl bg-[var(--color-foreground)] px-4 py-3 text-left text-[var(--color-background)] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:pointer-events-none disabled:opacity-50"
        >
          <span>
            <span className="block text-sm font-semibold">继续学习</span>
            <span className="mt-0.5 block text-[11px] opacity-65">系统按薄弱程度推荐下一题</span>
          </span>
          <span className="text-lg transition-transform group-hover:translate-x-1">→</span>
        </button>
      </div>

      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">
            <Trophy className="h-3.5 w-3.5" /> 学习地图
          </h2>
          <span className="text-[11px] text-[var(--color-muted-foreground)]">
            {stats.mastered}/{stats.total}
          </span>
        </div>

        <div className="space-y-3">
          {stats.categories.slice(0, 10).map(category => (
            <div key={category.id}>
              <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-medium">{category.title}</span>
                <span className="shrink-0 tabular-nums text-[var(--color-muted-foreground)]">{category.percent}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-500"
                  style={{ width: `${category.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-[var(--color-border)]/70 pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">我的学习清单</h3>
            <span className="text-[11px] text-[var(--color-muted-foreground)]">按画像过滤</span>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-muted-foreground)]" />
            <Input
              value={search}
              onChange={event => onSearchChange(event.target.value)}
              placeholder={`搜索 ${stats.total.toLocaleString()} 个推荐知识点`}
              className="h-9 pl-8 text-xs"
            />
          </div>
          {stats.total > 0 ? (
            <KnowledgeTree
              nodes={filteredRecommendedNodes}
              selectedId={selectedId}
              onSelect={onSelect}
              defaultOpenLevel={1}
              expandAll={search.trim() !== ''}
            />
          ) : (
            <div className="rounded-xl border border-dashed p-4 text-center text-xs text-[var(--color-muted-foreground)]">
              当前画像没有匹配内容，可在下方浏览全部知识。
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-[var(--color-border)]/70 pt-4">
          <button
            type="button"
            onClick={() => setTreeOpen(value => !value)}
            className="flex w-full items-center justify-between rounded-lg px-1 py-2 text-sm font-medium hover:text-[var(--color-primary)]"
          >
            <span>全部知识（{allCount.toLocaleString()}）</span>
            <ChevronDown className={cn('h-4 w-4 transition-transform', treeOpen && 'rotate-180')} />
          </button>

          {treeOpen && (
            <div className="mt-2">
              <p className="mb-3 text-[11px] leading-5 text-[var(--color-muted-foreground)]">
                保留完整资料层；上方搜索词会同时作用于这里。
              </p>
              <KnowledgeTree
                nodes={filteredAllNodes}
                selectedId={selectedId}
                onSelect={onSelect}
                expandAll={search.trim() !== ''}
              />
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

function StatCard({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: typeof Target
  value: number
  label: string
  tone: 'indigo' | 'amber' | 'emerald'
}) {
  const tones = {
    indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  }
  return (
    <div className={cn('rounded-xl p-2.5', tones[tone])}>
      <Icon className="mb-2 h-3.5 w-3.5" />
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="mt-0.5 text-[10px] opacity-75">{label}</div>
    </div>
  )
}

function buildLearningStats(nodes: KnowledgeTreeNode[], records: Record<string, LearningRecord>) {
  const readable = flattenReadableNodes(nodes)
  const today = new Date().toDateString()
  const mastered = readable.filter(node => records[node.id]?.rating === 'mastered').length
  const weak = readable.filter(node => ['weak', 'fuzzy'].includes(records[node.id]?.rating)).length
  const reviewedToday = readable.filter(node => {
    const updatedAt = records[node.id]?.updatedAt
    return updatedAt ? new Date(updatedAt).toDateString() === today : false
  }).length
  const categoryNodes = topLevelCategories(nodes)
  const categories = categoryNodes.map(category => {
    const children = flattenReadableNodes([category])
    const complete = children.filter(node => records[node.id]?.rating === 'mastered').length
    return {
      id: category.id,
      title: category.title,
      percent: children.length === 0 ? 0 : Math.round((complete / children.length) * 100),
    }
  })

  return {
    total: readable.length,
    mastered,
    weak,
    reviewedToday,
    sprintRemaining: Math.min(12, Math.max(0, readable.length - mastered)),
    categories,
  }
}

function topLevelCategories(nodes: KnowledgeTreeNode[]): KnowledgeTreeNode[] {
  const root = nodes.length === 1 && nodes[0].level === 0 ? nodes[0] : null
  return (root?.children ?? nodes).filter(node => node.nodeType === 'CATEGORY')
}

function flattenReadableNodes(nodes: KnowledgeTreeNode[]): KnowledgeTreeNode[] {
  return nodes.flatMap(node => [
    ...(node.nodeType === 'CATEGORY' ? [] : [node]),
    ...flattenReadableNodes(node.children),
  ])
}
