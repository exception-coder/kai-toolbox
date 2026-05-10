import { useState } from 'react'
import { Minimize2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { OutputBox } from '@/components/ui/output-box'
import { nginxFormat, nginxMinify } from '../lib/nginx'

const INDENT_OPTIONS = [
  { value: '2', label: '2 空格' },
  { value: '4', label: '4 空格' },
  { value: 'tab', label: 'Tab' },
] as const
type IndentValue = (typeof INDENT_OPTIONS)[number]['value']

export function NginxPanel() {
  const [indent, setIndent] = useState<IndentValue>('4')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = (op: 'format' | 'minify') => {
    setError(null)
    setOutput('')
    try {
      const indentVal = indent === 'tab' ? '\t' : (Number.parseInt(indent, 10) as 2 | 4)
      setOutput(op === 'format' ? nginxFormat(input, indentVal) : nginxMinify(input))
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败')
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[var(--color-muted-foreground)]">缩进</label>
        <Segmented value={indent} onChange={setIndent} options={INDENT_OPTIONS} />
        <p className="text-xs text-[var(--color-muted-foreground)]">
          注：注释独立成行；连续空行折叠；引号字符串原样保留。不做语义校验，只重新缩进。
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-[var(--color-muted-foreground)]">输入</label>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          rows={12}
          placeholder="server { listen 80; server_name example.com; location / { proxy_pass http://upstream; } }"
          className="w-full resize-y rounded-md border bg-[var(--color-background)] px-3 py-2 font-mono text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        />
      </div>

      <div className="flex gap-2">
        <Button onClick={() => run('format')} size="sm">
          <Sparkles /> 格式化
        </Button>
        <Button onClick={() => run('minify')} size="sm" variant="secondary">
          <Minimize2 /> 压缩
        </Button>
      </div>

      <OutputBox label="输出" value={output} error={error} rows={12} />
    </div>
  )
}
