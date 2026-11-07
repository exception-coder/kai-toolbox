import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Copy } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { copyRichTextToClipboard, copyTextToClipboard } from '../lib/clipboard'
import { formatMessageCopy, type MessageCopyFormat } from '../lib/messageCopy'

const formats: { id: MessageCopyFormat; label: string; hint: string }[] = [
  { id: 'readable', label: '易读文本', hint: '保留大纲，适合飞书、企微、钉钉聊天' },
  { id: 'rich', label: '富文本', hint: '保留标题、列表和表格；效果取决于接收端' },
  { id: 'markdown', label: 'Markdown 原文', hint: '保留全部格式标记，便于继续编辑' },
]

/** Same complete-source copy flow for individual answers and whole turns; no network or automatic sending. */
export function MessageCopyButton({ text, label = '复制回复', defaultFormat = 'readable' }: {
  text: string; label?: string; defaultFormat?: MessageCopyFormat
}) {
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'busy' | 'copied' | 'failed'>('idle')
  const [notice, setNotice] = useState('')
  const [retryFormat, setRetryFormat] = useState(defaultFormat)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const busy = useRef(false)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const copy = async (format: MessageCopyFormat) => {
    if (busy.current) return
    busy.current = true
    if (timer.current) clearTimeout(timer.current)
    setRetryFormat(format); setState('busy'); setNotice('')
    try {
      let actual = format
      if (format === 'markdown') await copyTextToClipboard(text)
      else {
        const content = formatMessageCopy(text)
        if (format === 'rich') actual = await copyRichTextToClipboard(content.text, content.html)
        else await copyTextToClipboard(content.text)
      }
      setState('copied')
      setNotice(format === 'rich' && actual === 'readable' ? '富文本不可用，已复制易读文本' : `已复制${formats.find(item => item.id === actual)!.label}`)
      setOpen(false)
      timer.current = setTimeout(() => { setState('idle'); setNotice('') }, 2500)
    } catch { setState('failed'); setNotice('复制失败，请重试或手动选择正文') }
    finally { busy.current = false }
  }
  return <div className="mt-1 flex flex-wrap items-center text-xs text-[var(--color-muted-foreground)]">
    <button type="button" aria-label={label} disabled={state === 'busy'} onClick={() => void copy(state === 'failed' ? retryFormat : defaultFormat)}
      title={defaultFormat === 'markdown' ? '复制完整原文' : '复制完整易读文本，保留大纲'}
      className="flex min-h-9 items-center gap-1 rounded-md px-2 py-1 hover:bg-[var(--color-muted)] max-md:min-h-11">
      {state === 'copied' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      <span>{state === 'copied' ? '已复制' : state === 'failed' ? '复制失败，重试' : label === '复制本轮' ? label : '复制'}</span>
    </button>
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild><button type="button" aria-label={`${label}：选择格式`} title="选择复制格式" className="flex min-h-9 min-w-8 items-center justify-center rounded-md hover:bg-[var(--color-muted)] max-md:min-h-11 max-md:min-w-11"><ChevronDown className="size-3.5" /></button></PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 max-w-[calc(100vw-2rem)] bg-[var(--color-popover)] p-1">
        <div role="group" aria-label="复制格式">{formats.map(format => <button key={format.id} type="button" disabled={state === 'busy'} onClick={() => void copy(format.id)} className="block min-h-11 w-full rounded px-3 py-2 text-left hover:bg-[var(--color-muted)]">
          <span className="block text-sm font-medium">{format.label}</span><span className="block text-xs text-[var(--color-muted-foreground)]">{format.hint}</span>
        </button>)}</div>
      </PopoverContent>
    </Popover>
    <span role="status" className={state === 'failed' || notice.startsWith('富文本不可用') ? 'basis-full px-2 text-xs' : 'sr-only'}>{notice}</span>
  </div>
}
