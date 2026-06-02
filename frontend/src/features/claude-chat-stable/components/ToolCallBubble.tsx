import { useState } from 'react'
import { ChevronDown, ChevronRight, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  toolName: string
  input: unknown
  output?: string
  isError?: boolean
}

/** 工具调用可视化气泡：标题 + 可折叠的参数/结果。 */
export function ToolCallBubble({ toolName, input, output, isError }: Props) {
  const [open, setOpen] = useState(false)
  const running = output === undefined
  return (
    <div className={cn(
      'rounded-lg border text-sm',
      isError ? 'border-[var(--color-destructive)]' : 'border-[var(--color-border)]',
    )}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        <Wrench className="size-4 text-[var(--color-muted-foreground)]" />
        <span className="font-medium">{toolName}</span>
        <span className="ml-auto text-xs text-[var(--color-muted-foreground)]">
          {running ? '运行中…' : isError ? '出错' : '完成'}
        </span>
      </button>
      {open && (
        <div className="space-y-2 border-t px-3 py-2">
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs text-[var(--color-muted-foreground)]">
            {safeJson(input)}
          </pre>
          {output !== undefined && (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
              {output}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function safeJson(v: unknown): string {
  if (v == null) return ''
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}
