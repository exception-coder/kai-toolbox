import { CheckCircle2, Copy, Quote } from 'lucide-react'

interface ConsultMessageActionsProps {
  align: 'start' | 'end'
  copied: boolean
  onCopy: () => void
  onQuote: () => void
}

export function ConsultMessageActions({ align, copied, onCopy, onQuote }: ConsultMessageActionsProps) {
  const buttonClass =
    'inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[11px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60 sm:min-h-0 sm:rounded sm:px-1.5 sm:py-0.5 sm:text-[10px]'

  return (
    <div
      className={`flex min-h-9 items-center gap-1 opacity-100 transition-opacity sm:min-h-0 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 ${
        align === 'end' ? 'justify-end' : 'justify-start'
      }`}
      aria-label="消息操作"
    >
      <button type="button" onClick={onQuote} className={buttonClass} title="引用这条消息到输入框追问">
        <Quote className="size-3.5 sm:size-3" /> 引用
      </button>
      <button type="button" onClick={onCopy} className={buttonClass} title="复制消息内容" aria-live="polite">
        {copied ? <CheckCircle2 className="size-3.5 text-emerald-600 sm:size-3" /> : <Copy className="size-3.5 sm:size-3" />}
        {copied ? '已复制' : '复制'}
      </button>
    </div>
  )
}
