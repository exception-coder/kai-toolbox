import { useEffect, useState } from 'react'
import './page-skeleton.css'

/** 页面代码和首次数据共用的占位，不推测业务数据、不拦截外壳导航。 */
export function PageSkeleton({ title = '工作台', compact = false }: { title?: string; compact?: boolean }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 10_000)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <section className={`page-skeleton ${compact ? 'page-skeleton-compact' : ''}`} aria-label={`${title}加载中`} aria-busy="true">
      {!compact && <h1 className="text-base font-semibold">{title}</h1>}
      <p role="status" className="text-sm text-[var(--color-muted-foreground)]">
        {slow ? '加载比平时慢，可先切换其他功能，或重新加载。' : '正在加载内容…'}
      </p>
      {slow && <div className="flex flex-wrap gap-3 text-sm">
        <a className="inline-flex min-h-11 items-center underline underline-offset-4" href="/">返回工作台</a>
        <button className="min-h-11 underline underline-offset-4" onClick={() => window.location.reload()}>重新加载</button>
      </div>}
      <div className="page-skeleton-content" aria-hidden="true">
        <div className="page-skeleton-toolbar"><i /><i /></div>
        {Array.from({ length: compact ? 4 : 7 }, (_, index) => (
          <div className="page-skeleton-row" key={index}><i /><i /><i /></div>
        ))}
      </div>
    </section>
  )
}
