import { useState } from 'react'
import { Minimize2, Sparkles, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { OutputBox } from '@/components/ui/output-box'
import { jsonEscape, jsonFormat, jsonMinify, jsonUnescape } from '../lib/json'

const INDENT_OPTIONS = [
  { value: '2', label: '2 空格' },
  { value: '4', label: '4 空格' },
  { value: 'tab', label: 'Tab' },
] as const
type IndentValue = (typeof INDENT_OPTIONS)[number]['value']

export function JsonPanel() {
  const [indent, setIndent] = useState<IndentValue>('2')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = (op: 'format' | 'minify' | 'escape' | 'unescape') => {
    setError(null)
    setOutput('')
    try {
      const indentVal = indent === 'tab' ? '\t' : Number.parseInt(indent, 10)
      switch (op) {
        case 'format':
          setOutput(jsonFormat(input, indentVal))
          break
        case 'minify':
          setOutput(jsonMinify(input))
          break
        case 'escape':
          setOutput(jsonEscape(input))
          break
        case 'unescape':
          setOutput(jsonUnescape(input))
          break
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败')
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[var(--color-muted-foreground)]">缩进</label>
        <Segmented value={indent} onChange={setIndent} options={INDENT_OPTIONS} />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[var(--color-muted-foreground)]">输入</label>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={10}
          placeholder='{"name":"toolbox","items":[1,2,3]}'
          className="w-full resize-y rounded-md border bg-[var(--color-background)] px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run('format')} size="sm">
          <Sparkles /> 格式化
        </Button>
        <Button onClick={() => run('minify')} size="sm" variant="secondary">
          <Minimize2 /> 压缩
        </Button>
        <Button onClick={() => run('escape')} size="sm" variant="outline">
          <ArrowUpFromLine /> 转义
        </Button>
        <Button onClick={() => run('unescape')} size="sm" variant="outline">
          <ArrowDownToLine /> 反转义
        </Button>
      </div>

      <OutputBox label="输出" value={output} error={error} rows={10} />
    </div>
  )
}
