import { Link } from 'react-router-dom'
import { Code2, FileText, Image as ImageIcon, ListTree, Table2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Java8guHeading, Java8guQuestion } from '../types'
import { toPreviewText } from '../lib/analyze'

interface Props {
  q: Java8guQuestion
}

const DIFFICULTY_LABELS = ['入门', '基础', '中等', '进阶', '硬核']
// 骨架里优先级最低的"容器型"标题——只有它们时才展示，有内容标题时过滤掉
const CONTAINER_HEADINGS = /^(典型回答|核心要点|答案|回答|概述|简介|前言|总结|小结)$/

export function QuestionCard({ q }: Props) {
  // 章节骨架 = 把已抽取的 headings 当 Topic Node 的子主题展示，比拍平的文本更适合扫描
  const outline = buildOutline(q.headings)
  // 没有骨架时（极少数无标题文档）才回落到一行洗净的概览文本
  const fallbackPreview = outline.length === 0 && q.tldr ? toPreviewText(q.tldr) : ''
  const difficultyLabel = DIFFICULTY_LABELS[Math.min(4, Math.max(0, q.difficulty - 1))]

  return (
    <Link
      to={`/tools/java8gu/q/${q.id}`}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-xl border bg-[var(--color-card)] shadow-sm transition-all',
        'hover:-translate-y-0.5 hover:border-[var(--color-primary)]/40 hover:shadow-md',
      )}
    >
      <div className="absolute left-0 top-0 h-full w-1 bg-[var(--color-primary)]/40" />

      <div className="flex flex-1 flex-col p-4 pl-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] tracking-wider text-[var(--color-muted-foreground)]">
            #{q.id}
          </span>
          <DifficultyMeter level={q.difficulty} label={difficultyLabel} />
        </div>

        <h3 className="line-clamp-2 text-[14.5px] font-semibold leading-snug tracking-tight text-[var(--color-foreground)]">
          {q.title}
        </h3>

        {outline.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {outline.slice(0, 6).map((text, i) => (
              <span
                key={i}
                className="max-w-full truncate rounded-md bg-[var(--color-primary)]/8 px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-primary)] ring-1 ring-inset ring-[var(--color-primary)]/12"
                title={text}
              >
                {text}
              </span>
            ))}
            {outline.length > 6 && (
              <span className="rounded-md px-1 py-0.5 text-[11px] text-[var(--color-muted-foreground)]">
                +{outline.length - 6}
              </span>
            )}
          </div>
        ) : (
          fallbackPreview && (
            <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-[var(--color-muted-foreground)]">
              {fallbackPreview}
            </p>
          )
        )}

        <div className="mt-auto pt-3">
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
            <span className="font-medium text-[var(--color-foreground)]">
              {q.readMin} min
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

/**
 * 从已抽取的 headings 构造"章节骨架"：
 * 取最浅一层标题作子主题；若该层不足 2 个，下探一层补齐。
 * 标题去掉行首 emoji 装饰与行内 markdown 标记；优先过滤纯容器型标题。
 */
function buildOutline(headings: Java8guHeading[]): string[] {
  if (!headings.length) return []
  const minLevel = Math.min(...headings.map(h => h.level))
  let picked = headings.filter(h => h.level === minLevel)
  if (picked.length < 2) picked = headings.filter(h => h.level <= minLevel + 1)
  const cleaned = picked.map(h => cleanHeading(h.text)).filter(Boolean)
  const contentful = cleaned.filter(t => !CONTAINER_HEADINGS.test(t))
  // 全是容器型标题时（如整篇只有「典型回答」），宁可显示它也别空着
  return contentful.length > 0 ? contentful : cleaned
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
