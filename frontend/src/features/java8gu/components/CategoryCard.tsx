import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import type { Java8guCategory } from '../types'

interface Props {
  category: Java8guCategory
}

export function CategoryCard({ category }: Props) {
  // 类目主题色：基于 hue 派生柔和背景与浓郁色条
  const bg = `linear-gradient(135deg, oklch(0.97 0.04 ${category.hue}) 0%, oklch(0.93 0.06 ${category.hue}) 100%)`
  const bgDark = `linear-gradient(135deg, oklch(0.22 0.05 ${category.hue}) 0%, oklch(0.18 0.04 ${category.hue}) 100%)`
  const accent = `oklch(0.55 0.18 ${category.hue})`

  return (
    <Link
      to={`/tools/java8gu/c/${category.id}`}
      className="group relative block overflow-hidden rounded-xl border bg-[var(--color-card)] shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-90 dark:hidden"
        style={{ background: bg }}
      />
      <div
        className="pointer-events-none absolute inset-0 hidden opacity-90 dark:block"
        style={{ background: bgDark }}
      />
      <div
        className="absolute left-0 top-0 h-full w-1"
        style={{ background: accent }}
      />

      <div className="relative px-4 pb-3.5 pt-4 sm:px-5 sm:pb-4 sm:pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[11px] tracking-wider text-[var(--color-muted-foreground)]">
              {category.id.split('_')[0]}
            </div>
            <div className="mt-0.5 truncate text-base font-semibold tracking-tight">
              {category.label}
            </div>
          </div>
          <div className="flex items-baseline gap-0.5">
            <span
              className="text-2xl font-semibold leading-none tracking-tight tabular-nums"
              style={{ color: accent }}
            >
              {category.count}
            </span>
            <span className="text-[11px] text-[var(--color-muted-foreground)]">题</span>
          </div>
        </div>

        {/* 关键字 chips */}
        {category.keywordChips.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {category.keywordChips.slice(0, 4).map(k => (
              <span
                key={k}
                className="rounded-full bg-[var(--color-background)]/70 px-2 py-0.5 text-[10px] font-medium text-[var(--color-foreground)] ring-1 ring-inset ring-[var(--color-border)]"
              >
                {k}
              </span>
            ))}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)]/60 pt-2.5">
          <span className="text-[11px] text-[var(--color-muted-foreground)]">
            点击进入卡片视图
          </span>
          <ArrowUpRight
            className="h-4 w-4 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            style={{ color: accent }}
          />
        </div>
      </div>
    </Link>
  )
}
