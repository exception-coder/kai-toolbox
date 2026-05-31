import { useState } from 'react'
import { ChevronDown, ChevronRight, Code2, FileText, Hash, Sparkles, Table2, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ParsedCodeBlock, ParsedSection, ParsedStructure } from '../lib/structure'
import { iconFor } from '../lib/mindmap'

interface Props {
  structure: ParsedStructure
}

interface SectionGroup {
  head: ParsedSection
  /** 该 ## 下的所有 ### / #### 子节，按顺序 */
  children: ParsedSection[]
}

/**
 * 图表视图 = 速记知识点的卡片化展示。
 * 一个 ## 一个大卡片，卡内挂全部 bullets；### 作为内嵌小节。
 * 不再渲染任何 mermaid（mermaid 块在 markdown 渲染层已剥离）。
 */
export function QuestionVisualSummary({ structure }: Props) {
  const groups = groupSections(structure.sections)

  return (
    <div className="space-y-6">
      {/* 关键术语 chip 云 */}
      {structure.terms.length > 0 && (
        <SectionBlock
          title="关键术语"
          icon={<Sparkles className="h-3.5 w-3.5" />}
          subtitle="正文里 ⌜加粗⌟ 与 ⌜行内代码⌟ 高频短语"
        >
          <div className="flex flex-wrap gap-2">
            {structure.terms.map((t, i) => (
              <span
                key={i}
                className="rounded-full bg-[var(--color-primary)]/8 px-3 py-1 text-[12.5px] font-medium text-[var(--color-primary)] ring-1 ring-inset ring-[var(--color-primary)]/15"
              >
                {t}
              </span>
            ))}
          </div>
        </SectionBlock>
      )}

      {/* 速记卡片 —— 主体内容 */}
      {groups.length > 0 && (
        <SectionBlock
          title="速记卡片"
          icon={<FileText className="h-3.5 w-3.5" />}
          subtitle={`共 ${groups.length} 张 · 每张一个章节的全部知识点`}
        >
          <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-2">
            {groups.map((g, i) => (
              <NoteCard key={i} group={g} codeBlocks={structure.codeBlocks} />
            ))}
          </div>
        </SectionBlock>
      )}

      {/* 代码段索引 */}
      {structure.codeBlocks.length > 0 && (
        <SectionBlock
          title="代码段"
          icon={<Code2 className="h-3.5 w-3.5" />}
          subtitle={`共 ${structure.codeBlocks.length} 段，点击展开`}
        >
          <div className="space-y-2">
            {structure.codeBlocks.map((cb, i) => (
              <CodeBlockRow key={i} block={cb} index={i + 1} />
            ))}
          </div>
        </SectionBlock>
      )}

      {/* 表格索引 */}
      {structure.tables.length > 0 && (
        <SectionBlock
          title="表格"
          icon={<Table2 className="h-3.5 w-3.5" />}
          subtitle={`共 ${structure.tables.length} 张`}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {structure.tables.map((t, i) => (
              <div
                key={i}
                className="rounded-lg border bg-[var(--color-card)] px-3 py-2 text-xs"
              >
                <div className="font-mono text-[10.5px] text-[var(--color-muted-foreground)]">
                  表 #{i + 1} · {t.rows} 行 × {t.cols} 列
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {t.headers.slice(0, 6).map((h, j) => (
                    <span
                      key={j}
                      className="rounded bg-[var(--color-muted)] px-1.5 py-0.5 font-medium"
                    >
                      {h}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionBlock>
      )}
    </div>
  )
}

function groupSections(all: ParsedSection[]): SectionGroup[] {
  const groups: SectionGroup[] = []
  let current: SectionGroup | null = null
  for (const sec of all) {
    if (sec.level === 2) {
      current = { head: sec, children: [] }
      groups.push(current)
    } else if (current) {
      current.children.push(sec)
    } else {
      // 文章没有 ## 但有 ### —— 把第一个 ### 作为 head
      current = { head: sec, children: [] }
      groups.push(current)
    }
  }
  return groups
}

function SectionBlock({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string
  subtitle?: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2">
        <h2 className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold tracking-tight text-[var(--color-foreground)]">
          {icon && <span className="text-[var(--color-primary)]">{icon}</span>}
          {title}
        </h2>
        {subtitle && (
          <span className="text-[11px] text-[var(--color-muted-foreground)]">
            {subtitle}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

function NoteCard({
  group,
  codeBlocks,
}: {
  group: SectionGroup
  codeBlocks: ParsedCodeBlock[]
}) {
  const icon = iconFor(group.head.title)
  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border bg-[var(--color-card)] p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
      {/* 卡头：title + 元 chips */}
      <header className="flex items-start gap-2.5 border-b border-[var(--color-border)]/60 pb-3">
        <span className="text-2xl leading-none">{icon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold leading-snug tracking-tight">
            {group.head.title}
          </h3>
          <div className="mt-1.5 flex flex-wrap gap-1 text-[10.5px] text-[var(--color-muted-foreground)]">
            {group.children.length > 0 && (
              <span className="rounded-full bg-[var(--color-muted)] px-1.5 py-0.5">
                {group.children.length} 子节
              </span>
            )}
            {group.head.bullets.length > 0 && (
              <span className="rounded-full bg-[var(--color-muted)] px-1.5 py-0.5">
                {group.head.bullets.length} 要点
              </span>
            )}
            {group.head.codeBlockIdxs.length > 0 && (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                {group.head.codeBlockIdxs.length} 段代码
              </span>
            )}
          </div>
        </div>
      </header>

      {/* 头部章节的 bullets */}
      {group.head.bullets.length > 0 && (
        <Bullets items={group.head.bullets} />
      )}

      {/* 代码段引用（仅头部章节） */}
      {group.head.codeBlockIdxs.length > 0 && (
        <CodeRefRow idxs={group.head.codeBlockIdxs} codeBlocks={codeBlocks} />
      )}

      {/* ### 子节 */}
      {group.children.map((sub, i) => (
        <div
          key={i}
          className="rounded-lg border border-[var(--color-border)]/50 bg-[var(--color-background)] p-3"
        >
          <div className="mb-1.5 flex items-center gap-1.5">
            <span className="text-base leading-none">{iconFor(sub.title)}</span>
            <h4 className="text-[13.5px] font-semibold tracking-tight">
              {sub.title}
            </h4>
            <div className="ml-auto flex gap-1 text-[10px] text-[var(--color-muted-foreground)]">
              {sub.bullets.length > 0 && (
                <span className="rounded bg-[var(--color-muted)] px-1.5 py-0.5">
                  {sub.bullets.length}
                </span>
              )}
              {sub.codeBlockIdxs.length > 0 && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300">
                  {sub.codeBlockIdxs.length} code
                </span>
              )}
            </div>
          </div>
          {sub.bullets.length > 0 && <Bullets items={sub.bullets} dense />}
          {sub.codeBlockIdxs.length > 0 && (
            <CodeRefRow idxs={sub.codeBlockIdxs} codeBlocks={codeBlocks} />
          )}
        </div>
      ))}

      {/* 空兜底：既没 bullets 也没子节时给个提示 */}
      {group.head.bullets.length === 0 && group.children.length === 0 && (
        <p className="text-[12px] italic text-[var(--color-muted-foreground)]">
          本节无列表要点，请查看原文。
        </p>
      )}
    </article>
  )
}

function Bullets({ items, dense }: { items: string[]; dense?: boolean }) {
  return (
    <ul className={cn('space-y-1.5', dense && 'space-y-1')}>
      {items.map((b, i) => (
        <li
          key={i}
          className={cn(
            'flex items-start gap-2 leading-relaxed text-[var(--color-foreground)]/90',
            dense ? 'text-[12px]' : 'text-[13px]',
          )}
        >
          <span className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]/55" />
          <span>{b}</span>
        </li>
      ))}
    </ul>
  )
}

function CodeRefRow({
  idxs,
  codeBlocks,
}: {
  idxs: number[]
  codeBlocks: ParsedCodeBlock[]
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {idxs.map(idx => {
        const cb = codeBlocks[idx]
        if (!cb) return null
        return (
          <span
            key={idx}
            className="inline-flex items-center gap-1 rounded-md border border-amber-300/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10.5px] text-amber-700 dark:text-amber-300"
            title={cb.firstLine}
          >
            <Terminal className="h-2.5 w-2.5" />#{idx + 1} · {cb.lang} · {cb.lines}行
          </span>
        )
      })}
    </div>
  )
}

function CodeBlockRow({ block, index }: { block: ParsedCodeBlock; index: number }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-lg border bg-[var(--color-card)]">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full min-w-0 items-center gap-1.5 px-2.5 py-2 text-left hover:bg-[var(--color-muted)]/40 sm:gap-2 sm:px-3"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
        )}
        <Terminal className="h-3.5 w-3.5 shrink-0 text-[var(--color-primary)]" />
        <span className="shrink-0 font-mono text-[11px] text-[var(--color-muted-foreground)]">
          <Hash className="mr-0.5 inline h-2.5 w-2.5" />
          {index}
        </span>
        <span className="shrink-0 rounded bg-[var(--color-muted)] px-1.5 py-0.5 font-mono text-[10.5px]">
          {block.lang}
        </span>
        <span className="shrink-0 text-[11.5px] text-[var(--color-muted-foreground)]">
          {block.lines} 行
        </span>
        {block.firstLine && !open && (
          <span className="ml-1 hidden min-w-0 truncate font-mono text-[11.5px] text-[var(--color-muted-foreground)]/80 sm:ml-2 sm:inline">
            {block.firstLine}
          </span>
        )}
      </button>
      {open && (
        <pre
          className={cn(
            'overflow-x-auto border-t bg-[var(--color-background)] px-2.5 py-2 font-mono text-[12px] leading-relaxed sm:px-3',
          )}
        >
          <code className={`language-${block.lang}`}>{block.body}</code>
        </pre>
      )}
    </div>
  )
}
