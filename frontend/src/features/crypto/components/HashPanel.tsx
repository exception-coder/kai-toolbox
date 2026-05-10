import { useMemo, useState } from 'react'
import { Segmented } from '@/components/ui/segmented'
import { OutputBox } from '@/components/ui/output-box'
import { hash, type HashAlgo } from '../lib/hash'

const ALGO_OPTIONS = [
  { value: 'MD5', label: 'MD5' },
  { value: 'SHA1', label: 'SHA-1' },
  { value: 'SHA256', label: 'SHA-256' },
  { value: 'SHA512', label: 'SHA-512' },
] as const

const CASE_OPTIONS = [
  { value: 'lower', label: '小写' },
  { value: 'upper', label: '大写' },
] as const

export function HashPanel() {
  const [algo, setAlgo] = useState<HashAlgo>('MD5')
  const [letterCase, setLetterCase] = useState<'lower' | 'upper'>('lower')
  const [input, setInput] = useState('')

  const output = useMemo(() => hash(algo, input, letterCase === 'upper'), [algo, input, letterCase])

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">算法</label>
          <Segmented value={algo} onChange={setAlgo} options={ALGO_OPTIONS} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">输出</label>
          <Segmented value={letterCase} onChange={setLetterCase} options={CASE_OPTIONS} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[var(--color-muted-foreground)]">输入</label>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={6}
          placeholder="待计算哈希的文本（UTF-8）"
          className="w-full resize-y rounded-md border bg-[var(--color-background)] px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        />
      </div>

      <OutputBox label="哈希值（hex）" value={output} rows={3} />
    </div>
  )
}
