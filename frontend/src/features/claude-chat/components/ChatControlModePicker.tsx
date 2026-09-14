import { useState, type Ref } from 'react'
import { Check, ChevronDown, CodeXml, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { ChatControlMode } from '../lib/controlMode'

const modes = [
  { value: 'CODE_AGENT', label: '开发助手', description: '围绕项目改代码、执行任务', icon: CodeXml },
  { value: 'LLM', label: '自由对话', description: '问答、写作与内容创作', icon: MessageSquare },
] as const

interface Props {
  mode: ChatControlMode
  allowedAgent: boolean
  allowedLlm: boolean
  onChange: (mode: ChatControlMode) => void
  triggerRef?: Ref<HTMLButtonElement>
}

/** Keep the current conversation title primary; explain the choice only when requested. */
export function ChatControlModePicker({ mode, allowedAgent, allowedLlm, onChange, triggerRef }: Props) {
  const [open, setOpen] = useState(false)
  const current = modes.find(option => option.value === mode)!
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button ref={triggerRef} type="button" variant="ghost" size="sm"
        aria-label={`切换对话方式，当前${current.label}`}
        className="shrink-0 gap-1 px-2 font-normal text-[var(--color-muted-foreground)] max-md:min-h-11">
        <span>{current.label}</span><ChevronDown aria-hidden="true" className="size-3" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-64 max-w-[calc(100vw-2rem)] p-1" aria-label="对话方式">
      <div role="group" aria-label="选择对话方式">
        {modes.map(option => {
          const allowed = option.value === 'CODE_AGENT' ? allowedAgent : allowedLlm
          const selected = mode === option.value
          return <button key={option.value} type="button" aria-label={option.label}
            aria-pressed={selected} disabled={!allowed}
            onClick={() => { setOpen(false); if (!selected) onChange(option.value) }}
            className={cn('flex w-full items-start gap-3 rounded px-3 py-3 text-left transition-colors hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-50',
              selected && 'bg-[var(--color-accent)]')}>
            <option.icon aria-hidden="true" className="mt-1 size-4 shrink-0 text-[var(--color-muted-foreground)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="mt-1 block text-xs leading-relaxed text-[var(--color-muted-foreground)]">
                {allowed ? option.description : '当前账号暂无此权限'}
              </span>
            </span>
            {selected && <Check aria-hidden="true" className="mt-1 size-4 shrink-0" />}
          </button>
        })}
      </div>
    </PopoverContent>
  </Popover>
}
