import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ChevronDown,
  ChevronRight,
  Code2,
  FileText,
  Image as ImageIcon,
  ListTree,
  Table2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Java8guHeading, Java8guQuestion } from '../types'
import { toPreviewText } from '../lib/analyze'

interface Props {
  q: Java8guQuestion
}

const DIFFICULTY_LABELS = ['入门', '基础', '中等', '进阶', '硬核']
// 纯"容器型"标题：有内容标题时过滤掉，只剩它们时才退而展示
const CONTAINER_HEADINGS = /^(典型回答|核心要点|答案|回答|概述|简介|前言|总结|小结)$/
const CHIP_LIMIT = 6

interface OutlineGroup {
  title: string
  /** 该章节下的次级子节（次浅一层标题） */
  children: string[]
}

export function QuestionCard({ q }: Props) {
  const [expanded, setExpanded] = useState(false)

  // 章节骨架：把已抽取的 headings 当 Topic Node 的子主题树，比拍平文本更适合扫描
  const groups = buildOutlineTree(q.headings)
  const contentful = groups.filter(g => !CONTAINER_HEADINGS.test(g.title))
  const shown = contentful.length > 0 ? contentful : groups
  // 折叠态只露 CHIP_LIMIT 个 chip；有子节或被截断时才值得给"展开"
  const expandable =
    shown.length > CHIP_LIMIT || shown.some(g => g.children.length > 0)
  // 无任何标题的极少数文档：回落到一行洗净的概览文本
  const fallbackPreview = shown.length === 0 && q.tldr ? toPreviewText(q.tldr) : ''
  const difficultyLabel = DIFFICULTY_LABELS[Math.min(4, Math.max(0, q.difficulty - 1))]

  return (
    <div
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-xl border bg-[var(--color-card)] shadow-sm transition-all',
        'hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40 hover:shadow-md',
      )}
    >
      <div className="absolute left-0 top-0 h-full w-1 bg-[var(--color-primary)]/40" />

      <Link to={`/tools/java8gu/q/${q.id}`} className="flex flex-1 flex-col p-4 pb-2 pl-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] tracking-wider text-[var(--color-muted-foreground)]">
            #{q.id}
          </span>
          <DifficultyMeter level={q.difficulty} label={difficultyLabel} />
        </div>

        <h3 className="line-clamp-2 text-[14.5px] font-semibold leading-snug tracking-tight text-[var(--color-foreground)]">
          {q.title}
        </h3>

        {shown.length > 0 ? (
          expanded ? (
            <OutlineTree groups={shown} />
          ) : (
            <div className="mt-2.5 flex flex-wrap gap-1">
              {shown.slice(0, CHIP_LIMIT).map((g, i) => (
                <span
                  key={i}
                  className="max-w-full truncate rounded-md bg-[var(--color-primary)]/8 px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-primary)] ring-1 ring-inset ring-[var(--color-primary)]/12"
                  title={g.title}
                >
                  {g.title}
                </span>
              ))}
              {shown.length > CHIP_LIMIT && (
                <span className="rounded-md px-1 py-0.5 text-[11px] text-[var(--color-muted-foreground)]">
                  +{shown.length - CHIP_LIMIT}
                </span>
              )}
            </div>
          )
        ) : (
          fallbackPreview && (
            <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-[var(--color-muted-foreground)]">
              {fallbackPreview}
            </p>
          )
        )}
      </Link>

      <div className="flex items-center justify-between gap-2 px-4 pb-3 pl-5 pt-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-[var(--color-muted-foreground)]">
          <Stat icon={FileText} label={`${formatChars(q.chars)} 字`} />
          <span aria-hidden>·</span>
          <Stat icon={ListTree} label={`${q.headings.length} 节`} />
          {q.codeCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <Stat icon={Code2} label={`${q.codeCount} 段代码`} />
            </>
          )}
          {q.hasTable && (
            <>
              <span aria-hidden>·</span>
              <Stat icon={Table2} label="表" />
            </>
          )}
          {q.hasImage && (
            <>
              <span aria-hidden>·</span>
              <Stat icon={ImageIcon} label="图片" />
            </>
          )}
          <span aria-hidden>·</span>
          <span className="font-medium text-[var(--color-foreground)]">{q.readMin} min</span>
        </div>

        {expandable && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[11px] text-[var(--color-muted-foreground)] transition-colors hover:text-[var(--color-primary)]"
          >
            {expanded ? (
              <>
                收起 <ChevronDown className="h-3 w-3" />
              </>
            ) : (
              <>
                大纲 <ChevronRight className="h-3 w-3" />
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

function OutlineTree({ groups }: { groups: OutlineGroup[] }) {
  return (
    <ul className="mt-2.5 max-h-56 space-y-1.5 overflow-y-auto pr-1 text-[12px]">
      {groups.map((g, i) => (
        <li key={i}>
          <div className="flex items-start gap-1.5 font-medium text-[var(--color-foreground)]/90">
            <span className="mt-[6px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]/55" />
            <span>{g.title}</span>
          </div>
          {g.children.length > 0 && (
            <ul className="ml-[3px] mt-1 space-y-0.5 border-l border-[var(--color-border)] pl-3 text-[11.5px] text-[var(--color-muted-foreground)]">
              {g.children.slice(0, 8).map((c, j) => (
                <li key={j} className="truncate" title={c}>
                  {c}
                </li>
              ))}
              {g.children.length > 8 && (
                <li className="text-[var(--color-muted-foreground)]/70">
                  +{g.children.length - 8} …
                </li>
              )}
            </ul>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * 从已抽取的 headings 构造"章节骨架树"：
 * 取最浅一层标题作章节(group)，次浅一层挂为其子节(children)；更深层忽略。
 * 标题去掉行首 emoji 装饰与行内 markdown 标记。
 */
function buildOutlineTree(headings: Java8guHeading[]): OutlineGroup[] {
  if (!headings.length) return []
  const minLevel = Math.min(...headings.map(h => h.level))
  const groups: OutlineGroup[] = []
  let current: OutlineGroup | null = null
  for (const h of headings) {
    const text = cleanHeading(h.text)
    if (!text) continue
    if (h.level === minLevel) {
      current = { title: text, children: [] }
      groups.push(current)
    } else if (h.level === minLevel + 1) {
      if (current) current.children.push(text)
      else {
        current = { title: text, children: [] }
        groups.push(current)
      }
    }
  }
  return groups
}

// 行首装饰清理：箭头/杂项符号(U+2190-2BFF)、装饰符号(U+2600-27BF)、
// 变体选择符(U+FE00-FE0F)、emoji 区(U+1F000-1FAFF)、空白与中点分隔符
const HEADING_LEAD_DECOR =
  /^[←-⯿☀-➿︀-️\u{1F000}-\u{1FAFF}\s·]+/u

function cleanHeading(text: string): string {
  return toPreviewText(text).replace(HEADING_LEAD_DECOR, '').trim()
}

function DifficultyMeter({ level, label }: { level: number; label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] text-[var(--color-muted-foreground)]"
      title={`复杂度 ${label}`}
    >
      <span className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              i < level
                ? 'bg-[var(--color-primary)]/70'
                : 'bg-[var(--color-muted-foreground)]/25',
            )}
          />
        ))}
      </span>
      {label}
    </span>
  )
}

function Stat({ icon: Icon, label }: { icon: typeof FileText; label: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icon className="h-3 w-3" />
      <span className="tabular-nums">{label}</span>
    </span>
  )
}

function formatChars(n: number): string {
  if (n < 1000) return `${n}`
  return `${(n / 1000).toFixed(1)}k`
}
