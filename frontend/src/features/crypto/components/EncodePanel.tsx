import { useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { OutputBox } from '@/components/ui/output-box'
import { decode, encode, type EncodeKind } from '../lib/encode'

const KIND_OPTIONS = [
  { value: 'base64', label: 'Base64' },
  { value: 'hex', label: 'Hex' },
  { value: 'url', label: 'URL' },
] as const

export function EncodePanel() {
  const [kind, setKind] = useState<EncodeKind>('base64')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = (op: 'enc' | 'dec') => {
    setError(null)
    try {
      setOutput(op === 'enc' ? encode(kind, input) : decode(kind, input))
    } catch (e) {
      setOutput('')
      setError(e instanceof Error ? e.message : '操作失败')
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[var(--color-muted-foreground)]">编码方式</label>
        <Segmented value={kind} onChange={setKind} options={KIND_OPTIONS} />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[var(--color-muted-foreground)]">输入</label>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={5}
          placeholder="编码：原始文本；解码：编码后的字符串"
          className="w-full resize-y rounded-md border bg-[var(--color-background)] px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={() => run('enc')} size="sm">
          <ArrowUp /> 编码
        </Button>
        <Button onClick={() => run('dec')} size="sm" variant="secondary">
          <ArrowDown /> 解码
        </Button>
      </div>

      <OutputBox label="输出" value={output} error={error} />
    </div>
  )
}
