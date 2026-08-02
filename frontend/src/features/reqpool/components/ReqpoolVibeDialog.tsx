import { useEffect, useState } from 'react'
import { Code2, Loader2, LockKeyhole, Send, Sparkles, X } from 'lucide-react'
import { EngineIcon } from '@/features/claude-chat/components/EngineIcon'
import type { Engine } from '@/features/claude-chat/types'

type ReqpoolEngine = Extract<Engine, 'codex' | 'claude'>

interface ReqpoolVibeDialogProps {
  initialPrompt: string
  repoAvailable: boolean
  activating: boolean
  onClose: () => void
  onSubmit: (prompt: string, engine: ReqpoolEngine) => void
}

const ENGINES: Array<{ value: ReqpoolEngine; label: string; hint: string }> = [
  { value: 'codex', label: 'Codex', hint: '默认，适合直接改码' },
  { value: 'claude', label: 'Claude', hint: '可切换的备选引擎' },
]

/** AI 需求中枢专用的轻量 Vibe Coding 起始弹窗。后续对话复用全局悬浮会话。 */
export function ReqpoolVibeDialog({
  initialPrompt,
  repoAvailable,
  activating,
  onClose,
  onSubmit,
}: ReqpoolVibeDialogProps) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [engine, setEngine] = useState<ReqpoolEngine>('codex')

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !activating) onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [activating, onClose])

  const submit = () => {
    const value = prompt.trim()
    if (!value || !repoAvailable || activating) return
    onSubmit(value, engine)
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/45 p-4 backdrop-blur-[2px]" onMouseDown={event => event.target === event.currentTarget && !activating && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="reqpool-vibe-title" className="w-full max-w-xl overflow-hidden rounded-2xl border border-violet-200 bg-[var(--color-card)] shadow-2xl dark:border-violet-900">
        <div className="flex items-start gap-3 border-b border-[var(--color-border)] bg-[linear-gradient(120deg,rgba(124,58,237,0.10),transparent_65%)] px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-600 text-white shadow-sm"><Code2 className="h-4.5 w-4.5" /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="reqpool-vibe-title" className="text-sm font-semibold">Vibe Coding · 调整当前页面</h2>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"><LockKeyhole className="h-2.5 w-2.5" />仅 AI 需求中枢</span>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-[var(--color-muted-foreground)]">描述想怎么改，AI 将直接读取并修改当前需求中枢页面；提交后可在悬浮对话窗继续沟通。</p>
          </div>
          <button type="button" disabled={activating} onClick={onClose} className="rounded-lg p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-muted)] disabled:opacity-40" aria-label="关闭"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <div className="mb-2 flex items-center justify-between"><label className="text-xs font-semibold">执行引擎</label><span className="text-[9px] text-[var(--color-muted-foreground)]">默认 Codex</span></div>
            <div className="grid grid-cols-2 gap-2">
              {ENGINES.map(option => (
                <button key={option.value} type="button" onClick={() => setEngine(option.value)} className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-colors ${engine === option.value ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-200 dark:bg-violet-950/30 dark:ring-violet-900' : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]'}`}>
                  <EngineIcon engine={option.value} className="h-4 w-4" title={option.label} />
                  <span><span className="block text-xs font-semibold">{option.label}</span><span className="mt-0.5 block text-[9px] text-[var(--color-muted-foreground)]">{option.hint}</span></span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="reqpool-vibe-prompt" className="text-xs font-semibold">你想怎么调整当前页面？</label>
            <textarea
              id="reqpool-vibe-prompt"
              autoFocus
              rows={6}
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault()
                  submit()
                }
              }}
              placeholder="例如：把领导视图改成更聚焦决策的三段式汇报，并在表格中突出超过 7 天未更新的需求。"
              className="mt-2 w-full resize-none rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3.5 py-3 text-sm leading-6 outline-none transition-colors placeholder:text-[var(--color-muted-foreground)] focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-950"
            />
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-[10px] leading-4 text-amber-800 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-300">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span><strong>范围已锁定：</strong>仅允许修改 <code>frontend/src/features/reqpool</code>，不会改动后端、公共组件或其他业务模块。</span>
          </div>

          {!repoAvailable && <div className="rounded-lg bg-rose-50 px-3 py-2 text-[10px] text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">当前未配置 kai-toolbox 自身仓库路径，暂时无法启动 Vibe Coding。</div>}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-3.5">
          <span className="flex items-center gap-1.5 text-[9px] text-[var(--color-muted-foreground)]"><Sparkles className="h-3 w-3 text-violet-500" />Ctrl / ⌘ + Enter 发起</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={activating} onClick={onClose} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs hover:bg-[var(--color-muted)] disabled:opacity-40">取消</button>
            <button type="button" disabled={!prompt.trim() || !repoAvailable || activating} onClick={submit} className="flex min-w-28 items-center justify-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-45">{activating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}{activating ? '正在启动' : `交给 ${engine === 'codex' ? 'Codex' : 'Claude'}`}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
