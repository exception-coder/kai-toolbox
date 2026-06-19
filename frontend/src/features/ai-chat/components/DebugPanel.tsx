import { useEffect, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import type { CompletionDebug } from '../types'

interface Props {
  open: boolean
  onClose: () => void
  debug: CompletionDebug | null
}

/**
 * 调试信息抽屉：展示最近一次补全的真实请求参数 + 上下文 + 上游返回元数据。
 * 重点核验字段：请求模型 vs 上游回显模型（responseModel）、finishReason、token 用量。
 * 一键复制完整 JSON，便于贴出来分析。右侧滑出，Esc / 点遮罩关闭。
 */
export function DebugPanel({ open, onClose, debug }: Props) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) setCopied(false)
  }, [open])

  if (!open) return null

  const copy = async () => {
    if (!debug) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(debug, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* 复制失败忽略 */
    }
  }

  const modelMismatch = debug?.responseModel && debug.responseModel !== debug.model

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-[28rem] max-w-[92vw] flex-col border-l border-[var(--color-border)] bg-[var(--color-background)] shadow-xl">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <span className="text-sm font-medium">调试信息（最近一次请求）</span>
          {debug && (
            <button
              type="button"
              onClick={copy}
              title="复制完整 JSON"
              className="ml-auto flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-[var(--color-accent)]"
            >
              {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              {copied ? '已复制' : '复制 JSON'}
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="关闭" className={debug ? 'rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]' : 'ml-auto rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'}>
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
          {!debug ? (
            <p className="text-[var(--color-muted-foreground)]">还没有请求记录，发送一条消息后这里会显示最近一次的请求与响应。</p>
          ) : (
            <>
              <Section title="请求">
                <Row k="时间" v={new Date(debug.requestedAt).toLocaleString()} />
                <Row k="网关地址" v={debug.baseUrl} />
                <Row k="模型" v={debug.model} />
                <Row k="温度" v={debug.temperatureSent == null ? '未下发（推理模型）' : String(debug.temperatureSent)} />
                <Row k="maxTokens" v={debug.maxTokens == null ? '未设' : String(debug.maxTokens)} />
                <Row k="上下文消息数" v={String(debug.messages.length)} />
              </Section>

              <Section title="响应">
                <Row k="状态" v={debug.status} />
                <Row
                  k="上游回显模型"
                  v={debug.responseModel ?? '（未返回）'}
                  warn={!!modelMismatch}
                  hint={modelMismatch ? '与请求模型不一致，可能被上游改写！' : undefined}
                />
                <Row k="finishReason" v={debug.finishReason ?? '（未返回）'} />
                <Row k="耗时" v={debug.latencyMs == null ? '—' : `${debug.latencyMs} ms`} />
                <Row k="token（入/出/总/缓存）" v={`${debug.promptTokens ?? '—'} / ${debug.completionTokens ?? '—'} / ${debug.totalTokens ?? '—'} / ${debug.cachedTokens ?? '—'}`} />
                <Row k="返回字符数" v={String(debug.responseChars ?? 0)} />
                {debug.error && <Row k="错误" v={debug.error} warn />}
              </Section>

              <Section title={`实际发送的上下文（${debug.messages.length} 条）`}>
                <div className="space-y-2">
                  {debug.messages.map((m, i) => (
                    <div key={i} className="rounded-md border bg-[var(--color-muted)]/40 p-2">
                      <div className="mb-1 flex items-center gap-2 text-[11px] font-medium text-[var(--color-muted-foreground)]">
                        <span>{m.role}</span>
                        {m.images > 0 && <span className="rounded bg-sky-100 px-1 text-sky-700 dark:bg-sky-950 dark:text-sky-300">🖼 {m.images}</span>}
                      </div>
                      <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[var(--color-foreground)]">{m.text || '（空）'}</pre>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="原始 JSON">
                <pre className="max-h-72 overflow-auto rounded-md bg-[var(--color-muted)] p-2 font-mono text-[11px] leading-relaxed">{JSON.stringify(debug, null, 2)}</pre>
              </Section>
            </>
          )}
        </div>
      </aside>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">{title}</h3>
      {children}
    </section>
  )
}

function Row({ k, v, warn, hint }: { k: string; v: string; warn?: boolean; hint?: string }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="w-28 shrink-0 text-[var(--color-muted-foreground)]">{k}</span>
      <span className={`min-w-0 flex-1 break-words ${warn ? 'font-medium text-[var(--color-destructive)]' : ''}`}>
        {v}
        {hint && <span className="ml-1 text-[var(--color-destructive)]">（{hint}）</span>}
      </span>
    </div>
  )
}
