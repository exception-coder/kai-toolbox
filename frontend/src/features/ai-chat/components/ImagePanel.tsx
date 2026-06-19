import { useState } from 'react'
import { AlertTriangle, ImagePlus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { generateImages } from '../api'
import type { MessageView } from '../types'

interface Props {
  /** 当前绘图模型（category=image）；为空表示无可用绘图模型。 */
  model: string
  /** 当前绘图会话 id；为空表示尚无会话（提交时自动创建）。 */
  conversationId: string | null
  /** 该会话已持久化的消息（含历史绘图结果）。 */
  messages: MessageView[]
  /** 确保有归属会话，返回会话 id。 */
  onEnsureConversation: (model: string) => Promise<string>
  /** 生成完成后通知父级重新拉取消息。 */
  onGenerated: () => void
}

const SIZES = ['1024x1024', '1792x1024', '1024x1792']

/** 绘图模式：提示词 + 尺寸/张数 → 调 /images 出图，结果持久化为会话消息、可回看。 */
export function ImagePanel({ model, conversationId, messages, onEnsureConversation, onGenerated }: Props) {
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState(SIZES[0])
  const [n, setN] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = !!model && !loading && prompt.trim().length > 0
  // 只展示有图片附件的助手消息（绘图结果）。
  const shots = messages.filter((m) => m.role === 'ASSISTANT' && m.attachments.length > 0)

  async function submit() {
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    const p = prompt.trim()
    try {
      const convId = conversationId ?? (await onEnsureConversation(model))
      await generateImages({ conversationId: convId, model, prompt: p, size, n })
      setPrompt('')
      onGenerated()
    } catch (e) {
      setError(e instanceof Error ? e.message : '绘图失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {shots.length === 0 && !loading && (
          <div className="flex h-full flex-col items-center justify-center text-center text-[var(--color-muted-foreground)]">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <ImagePlus className="size-7" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-[var(--color-foreground)]">绘图模式</h2>
            <p className="mt-1 text-sm">{model ? '输入提示词，选尺寸与张数，点生成' : '当前无可用绘图模型（在顶部模型里选 category=image 的模型）'}</p>
          </div>
        )}
        {loading && (
          <div className="flex items-center gap-2 text-sm text-[var(--color-muted-foreground)]">
            <Loader2 className="size-4 animate-spin" /> 生成中…
          </div>
        )}
        {shots.map((m) => (
          <div key={m.id} className="space-y-2">
            <p className="text-xs text-[var(--color-muted-foreground)]">
              <span className="font-medium text-[var(--color-foreground)]">{m.content}</span>
              {m.model && <span className="ml-2">· {m.model}</span>}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {m.attachments.map((a) => (
                <a key={a.id} href={a.url} target="_blank" rel="noreferrer" title="点击查看原图">
                  <img src={a.url} alt={m.content} className="aspect-square w-full rounded-lg border object-cover" />
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 border-t border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="min-w-0 flex-1">{error}</span>
        </div>
      )}

      <div className="border-t bg-[var(--color-background)] p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted-foreground)]">
          <label className="flex items-center gap-1">
            尺寸
            <select value={size} onChange={(e) => setSize(e.target.value)} className="rounded-md border bg-[var(--color-background)] px-1.5 py-1 text-xs">
              {SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            张数
            <select value={n} onChange={(e) => setN(Number(e.target.value))} className="rounded-md border bg-[var(--color-background)] px-1.5 py-1 text-xs">
              {[1, 2, 3, 4].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex items-end gap-2">
          <textarea
            className="max-h-40 min-h-[40px] flex-1 resize-none rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50"
            rows={1}
            placeholder={model ? '描述你想要的画面，Enter 生成，Shift+Enter 换行' : '无可用绘图模型'}
            value={prompt}
            disabled={!model}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
          />
          <Button size="icon" disabled={!canSubmit} onClick={submit} title="生成">
            {loading ? <Loader2 className="animate-spin" /> : <ImagePlus />}
          </Button>
        </div>
      </div>
    </div>
  )
}
