import { useState, type RefObject } from 'react'

interface DocOutlineProps {
  content: string
  targetRef: RefObject<HTMLDivElement | null>
}

const OUTLINE_CLASS_NAME = [
  'hidden w-48 flex-shrink-0 border-r border-[var(--color-border)]',
  'overflow-y-auto py-4 bg-[var(--color-card)] md:block',
].join(' ')

/** 从 Markdown 标题生成文档大纲，并定位到预览区中的对应标题。 */
export function DocOutline({ content, targetRef }: DocOutlineProps) {
  const [activeIdx, setActiveIdx] = useState(0)
  const headings: Array<{ level: number; text: string }> = []

  for (const line of content.split('\n')) {
    const match = line.match(/^(#{1,4})\s+(.+)/)
    if (match) headings.push({ level: match[1].length, text: match[2].trim() })
  }

  if (headings.length === 0) return null

  const scrollTo = (text: string, index: number) => {
    setActiveIdx(index)
    const root = targetRef.current
    if (!root) return

    for (const element of root.querySelectorAll('h1,h2,h3,h4')) {
      if (element.textContent?.trim() === text) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' })
        break
      }
    }
  }

  return (
    <div className={OUTLINE_CLASS_NAME}>
      <div className="px-4 mb-3 text-[10px] font-bold uppercase tracking-wider text-[var(--color-muted-foreground)]">
        大纲
      </div>
      {headings.map((heading, index) => (
        <button
          key={`${heading.level}-${heading.text}-${index}`}
          type="button"
          onClick={() => scrollTo(heading.text, index)}
          className={[
            'w-full text-left py-1 text-xs truncate transition-colors hover:bg-[var(--color-muted)]/50',
            activeIdx === index
              ? 'text-[var(--color-primary)] font-medium bg-[var(--color-primary)]/8'
              : 'text-[var(--color-foreground)]',
            heading.level === 1
              ? 'px-4'
              : heading.level === 2
                ? 'pl-6 pr-4 text-[11px]'
                : heading.level === 3
                  ? 'pl-8 pr-4 text-[11px] text-[var(--color-muted-foreground)]'
                  : 'pl-10 pr-4 text-[10px] text-[var(--color-muted-foreground)]',
          ].join(' ')}
        >
          {heading.text}
        </button>
      ))}
    </div>
  )
}
