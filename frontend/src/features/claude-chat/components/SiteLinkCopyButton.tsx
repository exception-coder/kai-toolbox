import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function SiteLinkCopyButton({ url, title }: { url: string; title: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle')
  const label = state === 'error' ? '复制失败，点击重试' : state === 'copied' ? '已复制链接' : `复制 ${title} 链接`

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setState('copied')
    } catch {
      setState('error')
    }
  }

  return (
    <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0"
      onClick={() => void copy()} onBlur={() => setState('idle')} aria-label={label} title={label}>
      {state === 'copied' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      <span className="sr-only" role="status">{state === 'idle' ? '' : label}</span>
    </Button>
  )
}
