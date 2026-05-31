import { useCallback, useRef, useState } from 'react'
import { Check, Copy, Download, Minimize2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/utils'
import { CodeEditor, type CodeEditorRef } from './CodeEditor'
import { SplitPane } from './SplitPane'
import { useSplitRatio } from '../lib/useSplitRatio'
import { SQL_DIALECTS, sqlFormat, sqlMinify, type SqlDialect, type SqlKeywordCase } from '../lib/sql'

const INDENT_OPTIONS = [
  { value: '2', label: '2 空格' },
  { value: '4', label: '4 空格' },
  { value: 'tab', label: 'Tab' },
] as const
type IndentValue = (typeof INDENT_OPTIONS)[number]['value']

const CASE_OPTIONS = [
  { value: 'upper', label: '关键字大写' },
  { value: 'lower', label: '关键字小写' },
  { value: 'preserve', label: '保留原样' },
] as const

const HIGHLIGHT_MAX_BYTES = 1 * 1024 * 1024
const COPY_MAX_BYTES = 8 * 1024 * 1024
const SOFT_WARN_BYTES = 32 * 1024 * 1024
const EDITOR_HEIGHT = 'calc(100vh - 320px)'
const EDITOR_MIN_HEIGHT = '320px'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export function SqlPanel() {
  const [indent, setIndent] = useState<IndentValue>('2')
  const [dialect, setDialect] = useState<SqlDialect>('sql')
  const [keywordCase, setKeywordCase] = useState<SqlKeywordCase>('upper')
  const [error, setError] = useState<string | null>(null)
  const [inputBytes, setInputBytes] = useState(0)
  const [outputBytes, setOutputBytes] = useState(0)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<CodeEditorRef>(null)
  const outputRef = useRef<CodeEditorRef>(null)
  const split = useSplitRatio('formatter.sql.splitRatio')

  const indentVal: number | '\t' = indent === 'tab' ? '\t' : Number.parseInt(indent, 10)

  const dispatch = useCallback(
    (op: 'format' | 'minify') => {
      setError(null)
      const input = inputRef.current?.getValue() ?? ''
      const res =
        op === 'format'
          ? sqlFormat(input, { indent: indentVal, dialect, keywordCase })
          : sqlMinify(input)
      if (res.ok) {
        outputRef.current?.setValue(res.output)
      } else {
        outputRef.current?.setValue('')
        setOutputBytes(0)
        setError(res.error)
      }
    },
    [indentVal, dialect, keywordCase],
  )

  const onCopy = useCallback(async () => {
    const v = outputRef.current?.getValue() ?? ''
    if (!v || outputBytes > COPY_MAX_BYTES) return
    try {
      await navigator.clipboard.writeText(v)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch { /* 静默 */ }
  }, [outputBytes])

  const onDownload = useCallback(() => {
    const v = outputRef.current?.getValue() ?? ''
    if (!v) return
    const blob = new Blob([v], { type: 'application/sql' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `formatted-${Date.now()}.sql`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [])

  const inputHighlight = inputBytes <= HIGHLIGHT_MAX_BYTES
  const outputHighlight = outputBytes <= HIGHLIGHT_MAX_BYTES
  const canCopy = outputBytes > 0 && outputBytes <= COPY_MAX_BYTES
  const canDownload = outputBytes > 0

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">方言</label>
          <select
            value={dialect}
            onChange={e => setDialect(e.target.value as SqlDialect)}
            className="h-8 rounded-md border bg-[var(--color-background)] px-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          >
            {SQL_DIALECTS.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">缩进</label>
          <Segmented value={indent} onChange={setIndent} options={INDENT_OPTIONS} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">关键字</label>
          <Segmented value={keywordCase} onChange={setKeywordCase} options={CASE_OPTIONS} />
        </div>
        <div className="flex flex-wrap gap-2 self-end">
          <Button onClick={() => dispatch('format')} size="sm">
            <Sparkles /> 格式化
          </Button>
          <Button onClick={() => dispatch('minify')} size="sm" variant="secondary">
            <Minimize2 /> 压缩
          </Button>
        </div>
      </div>

      <SplitPane
        ratio={split.ratio}
        containerRef={split.containerRef}
        onSplitterPointerDown={split.onSplitterPointerDown}
        onSplitterDoubleClick={split.reset}
        left={
          <>
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[var(--color-muted-foreground)]">输入</label>
              <span
                className={cn(
                  'text-[11px] tabular-nums text-[var(--color-muted-foreground)]',
                  inputBytes > SOFT_WARN_BYTES && 'text-[var(--color-destructive)]',
                )}
              >
                {formatBytes(inputBytes)}
                {!inputHighlight && inputBytes > 0 && '（已关高亮）'}
              </span>
            </div>
            <div style={{ height: EDITOR_HEIGHT, minHeight: EDITOR_MIN_HEIGHT }}>
              <CodeEditor
                ref={inputRef}
                language="sql"
                placeholder="SELECT id, name FROM users WHERE status = 'active' ORDER BY created_at DESC LIMIT 10;"
                minHeight="100%"
                maxHeight="100%"
                highlight={inputHighlight}
                onBytesChange={setInputBytes}
              />
            </div>
          </>
        }
        right={
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-[var(--color-muted-foreground)]">输出</label>
                {outputBytes > 0 && (
                  <span className="text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
                    {formatBytes(outputBytes)}
                    {!outputHighlight && '（已关高亮）'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onCopy}
                  disabled={!canCopy}
                  title={outputBytes > COPY_MAX_BYTES ? `结果超过 ${COPY_MAX_BYTES / 1024 / 1024} MB，请用下载` : '复制到剪贴板'}
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
                    canCopy
                      ? 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]'
                      : 'cursor-not-allowed opacity-50',
                  )}
                >
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                  {copied ? '已复制' : '复制'}
                </button>
                <button
                  type="button"
                  onClick={onDownload}
                  disabled={!canDownload}
                  title="下载为 .sql 文件"
                  className={cn(
                    'inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
                    canDownload
                      ? 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]'
                      : 'cursor-not-allowed opacity-50',
                  )}
                >
                  <Download className="size-3" /> 下载
                </button>
              </div>
            </div>
            <div style={{ height: EDITOR_HEIGHT, minHeight: EDITOR_MIN_HEIGHT }}>
              <CodeEditor
                ref={outputRef}
                language="sql"
                readOnly
                minHeight="100%"
                maxHeight="100%"
                highlight={outputHighlight}
                onBytesChange={setOutputBytes}
              />
            </div>
            {error && <p className="text-xs text-[var(--color-destructive)]">{error}</p>}
          </>
        }
      />
    </div>
  )
}
