import { useState } from 'react'
import { Check, ChevronDown, ChevronRight, CircleX, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { classifyTool } from '../lib/toolKinds'

interface Props {
  toolName: string
  input: unknown
  output?: string
  isError?: boolean
}

/** 工具类型由图标与标签识别，颜色只表达运行结果；展开状态不随主题改变。 */
export function ToolCallBubble({ toolName, input, output, isError }: Props) {
  const [open, setOpen] = useState(false)
  const running = output === undefined
  const meta = classifyTool(toolName)
  const Icon = meta.icon
  const state = isError ? 'failed' : running ? 'running' : 'completed'
  const StatusIcon = isError ? CircleX : running ? LoaderCircle : Check

  return (
    <div className={cn(
      'wb-tool-call min-w-0 max-w-full rounded-lg border text-sm',
      isError ? 'border-[var(--color-destructive)]'
        : 'border-[var(--color-border)]',
    )} data-tool-kind={meta.kind} data-agent-state={state}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left"
      >
        {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
        <Icon className="size-4 shrink-0 text-[var(--color-muted-foreground)]" />
        <span className="shrink-0 text-[10px] text-[var(--color-muted-foreground)]">{meta.label}</span>
        <span className="min-w-0 truncate font-medium">{toolName}</span>
        <span role="status" className={cn('wb-agent-status ml-auto inline-flex shrink-0 items-center gap-1 text-xs', isError ? 'text-[var(--color-danger)]' : running ? 'text-[var(--color-info)]' : 'text-[var(--color-success)]')}>
          <StatusIcon aria-hidden="true" className={`size-3 ${running && !isError ? 'wb-tool-running' : ''}`} />
          {isError ? '出错' : running ? '运行中…' : '完成'}
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
