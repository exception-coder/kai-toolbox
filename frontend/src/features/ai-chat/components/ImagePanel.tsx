import { useState } from 'react'
import { AlertTriangle, ImagePlus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { generateImages } from '../api'

interface Props {
  /** 当前绘图模型（category=image）；为空表示无可用绘图模型。 */
  model: string
  disabled?: boolean
}

const SIZES = ['1024x1024', '1792x1024', '1024x1792']

interface Generation {
  id: string
  prompt: string
  model: string
  images: string[]
}

/** 绘图模式视图：提示词 + 尺寸/张数 → 调 /images 同步出图，结果按次成组展示。会话级临时，不入聊天历史。 */
export function ImagePanel({ model, disabled }: Props) {
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState(SIZES[0])
  const [n, setN] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<Generation[]>([])

  const canSubmit = !!model && !disabled && !loading && prompt.trim().length > 0

  async function submit() {
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    const p = prompt.trim()
    try {
      const res = await generateImages({ model, prompt: p, size, n })
      setHistory((prev) => [{ id: `g_${Date.now()}`, prompt: p, model: res.model, images: res.images }, ...prev])
      setPrompt('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '绘图失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 space-y-6 overflow-y-auto p-4">
        {history.length === 0 && !loading && (
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
        {history.map((g) => (
          <div key={g.id} className="space-y-2">
            <p className="text-xs text-[var(--color-muted-foreground)]">
              <span className="font-medium text-[var(--color-foreground)]">{g.prompt}</span>
              <span className="ml-2">· {g.model}</span>
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {g.images.map((src, i) => (
                <a key={i} href={src} target="_blank" rel="noreferrer" title="点击查看原图">
                  <img src={src} alt={g.prompt} className="aspect-square w-full rounded-lg border object-cover" />
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
            disabled={!model || disabled}
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
