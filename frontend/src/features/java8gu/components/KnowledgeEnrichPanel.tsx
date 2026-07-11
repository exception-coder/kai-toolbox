// Block 3 UI：结构化知识 + AI 增强面板。
//
// 分层展示，成本可控：
// - markdown 原生就有的图解(mermaid)/易错点 → 立即渲染，零 AI 成本（Block 2 的果实）。
// - 面试问答 / 深度讲解 / 缺失的图解 → 点「AI 补全」按需拉取（后端 cache-first，二次即时）。
//
// 数据契约是 KnowledgePage（parseKnowledge 产出），AI 结果经 mergeEnrichment 只填空、不覆盖原生内容。

import { useEffect, useMemo, useRef, useState } from 'react'
import { HelpCircle, Loader2, Network, Sparkles, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import { mergeEnrichment, parseKnowledge } from '../lib/knowledge'
import { fetchEnrichment, peekEnrichment, type Enrichment } from '../lib/enrichApi'

interface Props {
  id: string
  markdown: string
  /**
   * stacked：作为正文下方的整宽区块（含上分隔线）。
   * pane：作为 PC 双栏的右侧列（无上分隔线，标题即分组头）。
   */
  variant?: 'stacked' | 'pane'
}

export function KnowledgeEnrichPanel({ id, markdown, variant = 'stacked' }: Props) {
  const base = useMemo(() => parseKnowledge(id, markdown), [id, markdown])
  const [enrich, setEnrich] = useState<Enrichment | null>(null)
  const [loading, setLoading] = useState(false)
  const [peeking, setPeeking] = useState(true)

  // 进题页/切题：只读缓存自动加载已补全结果（不触发 LLM）；没补全过则留手动按钮
  useEffect(() => {
    let cancelled = false
    setEnrich(null)
    setLoading(false)
    setPeeking(true)
    peekEnrichment(id, markdown)
      .then(result => {
        if (cancelled) return
        // miss（从未补全）不落地 enrich，避免误显示空补全区块
        if (!result.miss) setEnrich(result)
        setPeeking(false)
      })
      .catch(() => {
        if (!cancelled) setPeeking(false)
      })
    return () => {
      cancelled = true
    }
  }, [id, markdown])

  const page = enrich ? mergeEnrichment(base, enrich) : base

  const handleEnrich = async () => {
    setLoading(true)
    const result = await fetchEnrichment(id, markdown)
    setEnrich(result)
    setLoading(false)
  }

  const hasNativeExtras = page.diagrams.length > 0 || page.pitfalls.length > 0

  return (
    <section
      className={cn(
        variant === 'stacked'
          ? 'mt-8 border-t border-[var(--color-border)] pt-6 sm:mt-10'
          : 'mt-0',
      )}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold tracking-tight">
          <Sparkles className="h-4 w-4 text-[var(--color-primary)]" /> 结构化知识 · AI 增强
        </h2>
        <div className="flex items-center gap-2">
          {peeking && (
            <span className="inline-flex items-center gap-1 text-[10.5px] text-[var(--color-muted-foreground)]">
              <Loader2 className="h-3 w-3 animate-spin" /> 读取缓存…
            </span>
          )}
          {!peeking && enrich?.cached && !enrich.stale && (
            <span className="text-[10.5px] text-[var(--color-muted-foreground)]">已加载缓存</span>
          )}
          {!peeking && enrich?.stale && (
            <span className="text-[10.5px] text-amber-600 dark:text-amber-400">
              原文已更新，建议重新补全
            </span>
          )}
          <button
            type="button"
            onClick={handleEnrich}
            disabled={loading || peeking}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/8 px-3 py-1.5 text-[12px] font-medium text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)]/14 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {loading ? 'AI 补全中…' : enrich ? '重新补全' : 'AI 补全（图解/面试题/讲解）'}
          </button>
        </div>
      </div>

      {enrich?.error && (
        <p className="mb-4 rounded-lg border border-amber-300/50 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-300">
          AI 补全暂不可用：{enrich.error}（不影响上方原文内容）
        </p>
      )}

      {/* 未补全且无原生附加内容时的引导 */}
      {!enrich && !hasNativeExtras && !loading && !peeking && (
        <p className="text-[12.5px] text-[var(--color-muted-foreground)]">
          本题原文未含图解/面试题，也尚未 AI 补全。点上方「AI 补全」由模型生成图解、高频面试问答与深度讲解（结果会缓存，下次进本题自动加载）。
        </p>
      )}

      <div className="space-y-6">
        {/* 图解 —— 左文右图的落点 */}
        {page.diagrams.length > 0 && (
          <Block
            icon={<Network className="h-3.5 w-3.5" />}
            title="图解"
            source={page.enriched.diagrams ? 'ai' : 'markdown'}
          >
            <div className="space-y-3">
              {page.diagrams.map((d, i) => (
                <MermaidDiagram key={i} code={d.code} />
              ))}
            </div>
          </Block>
        )}

        {/* 面试问答 */}
        {page.qa.length > 0 && (
          <Block
            icon={<HelpCircle className="h-3.5 w-3.5" />}
            title="高频面试问答"
            source={page.enriched.qa ? 'ai' : 'markdown'}
          >
            <ul className="space-y-3">
              {page.qa.map((item, i) => (
                <li key={i} className="rounded-lg border bg-[var(--color-card)] p-3">
                  <p className="text-[13px] font-medium">Q：{item.q}</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-foreground)]/85">
                    A：{item.a}
                  </p>
                </li>
              ))}
            </ul>
          </Block>
        )}

        {/* 易错点 */}
        {page.pitfalls.length > 0 && (
          <Block
            icon={<TriangleAlert className="h-3.5 w-3.5" />}
            title="易错点"
            source={page.enriched.pitfalls ? 'ai' : 'markdown'}
          >
            <ul className="space-y-1.5">
              {page.pitfalls.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed">
                  <span className="mt-[7px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </Block>
        )}

        {/* 深度讲解 */}
        {page.explanation && (
          <Block
            icon={<Sparkles className="h-3.5 w-3.5" />}
            title="AI 深度讲解"
            source="ai"
          >
            <div className="whitespace-pre-wrap rounded-lg border bg-[var(--color-card)] p-3.5 text-[13px] leading-relaxed text-[var(--color-foreground)]/90">
              {page.explanation}
            </div>
          </Block>
        )}
      </div>
    </section>
  )
}

function Block({
  icon,
  title,
  source,
  children,
}: {
  icon: React.ReactNode
  title: string
  source: 'markdown' | 'ai'
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--color-foreground)]">
          <span className="text-[var(--color-primary)]">{icon}</span>
          {title}
        </h3>
        <span
          className={
            source === 'ai'
              ? 'rounded-full bg-[var(--color-primary)]/12 px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--color-primary)]'
              : 'rounded-full bg-[var(--color-muted)] px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--color-muted-foreground)]'
          }
        >
          {source === 'ai' ? 'AI 生成' : '原文'}
        </span>
      </div>
      {children}
    </div>
  )
}

/** 直接用 mermaid 渲染一段图源为 SVG；失败降级为可读的错误 + 源码。 */
function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setErr(null)
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' })
        const renderId = `j8g-mmd-${Math.random().toString(36).slice(2)}`
        const { svg } = await mermaid.render(renderId, code)
        if (!cancelled && ref.current) ref.current.innerHTML = svg
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [code])

  if (err) {
    return (
      <pre className="overflow-x-auto rounded-lg border border-amber-300/50 bg-amber-500/10 p-3 text-[11.5px] text-amber-700 dark:text-amber-300">
        图解渲染失败：{err}
        {'\n\n'}
        {code}
      </pre>
    )
  }
  return (
    <div
      ref={ref}
      className="overflow-x-auto rounded-lg border bg-white p-3 dark:bg-[var(--color-card)]"
    />
  )
}
