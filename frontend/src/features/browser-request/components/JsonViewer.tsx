import { useEffect, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { json as jsonLang } from '@codemirror/lang-json'
import { useIsDarkTheme } from '@/lib/useIsDarkTheme'
import { useJsonWorker } from '@/features/formatter/lib/useJsonWorker'
import type { WorkerReq } from '@/features/formatter/lib/json-worker'

/**
 * 大 JSON 只读查看器，复用 formatter 模块的 Web Worker 异步格式化 + CodeMirror viewport 渲染。
 * 设计目标：把 10MB+ 响应也能流畅滚、自动美化，不冻结主线程。
 *
 * 渲染策略（按 value 大小）：
 *   < 5MB    → worker 异步格式化（含 JSON.parse），CodeMirror 加 json lang 高亮 + 折叠
 *   5MB~30MB → 不格式化（worker parse 也慢），直接渲染原文本但关闭语言扩展
 *   > 30MB   → 截断到前 200KB + 「内容过大，已截断」提示
 *
 * 比直接 <pre> 强在：
 *   1. parse/format 在 worker 主线程零阻塞
 *   2. CodeMirror viewport——百万行也只渲染可见的 ~50 行 DOM
 *   3. 折叠、行号、Ctrl+F 搜索、暗色主题自动跟随
 */
const FORMAT_MAX_BYTES = 5 * 1024 * 1024    // 5MB 内异步格式化
const HIGHLIGHT_MAX_BYTES = 30 * 1024 * 1024 // 30MB 内开高亮
const GIVE_UP_BYTES = 30 * 1024 * 1024       // 超过就截断
const TRUNCATE_TO_BYTES = 200 * 1024         // 截到前 200KB

const cmFontTheme = EditorView.theme({
  '&': { fontSize: '12px' },
  '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
})

export function JsonViewer({
  value, maxHeight = '320px', className,
}: {
  value: string
  maxHeight?: string
  className?: string
}) {
  const dark = useIsDarkTheme()
  const { run } = useJsonWorker()
  const [display, setDisplay] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const len = value?.length ?? 0

  useEffect(() => {
    if (!value || !value.trim()) {
      setDisplay('')
      setParseError(null)
      setLoading(false)
      return
    }
    // 超大：截断 + 显示
    if (len > GIVE_UP_BYTES) {
      setDisplay(value.slice(0, TRUNCATE_TO_BYTES) +
        `\n\n[... 内容过大（${(len / 1024 / 1024).toFixed(1)} MB），已截断显示前 ${(TRUNCATE_TO_BYTES / 1024).toFixed(0)} KB ...]`)
      setParseError(null)
      setLoading(false)
      return
    }
    // 中等：原样显示（不 parse 不格式化）
    if (len > FORMAT_MAX_BYTES) {
      setDisplay(value)
      setParseError(null)
      setLoading(false)
      return
    }
    // 小：异步格式化
    let cancelled = false
    setLoading(true)
    run({ op: 'format', input: value, indent: 2 } as Omit<WorkerReq, 'id'>).then(res => {
      if (cancelled) return
      if (res.ok) {
        setDisplay(res.output ?? value)
        setParseError(null)
      } else {
        // 不是合法 JSON——降级展示 raw
        setDisplay(value)
        setParseError(res.error)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [value, len, run])

  const useHighlight = len <= HIGHLIGHT_MAX_BYTES
  const extensions = useHighlight ? [cmFontTheme, EditorView.lineWrapping, jsonLang()] : [cmFontTheme, EditorView.lineWrapping]

  return (
    <div className={className}>
      {(loading || parseError) && (
        <div className="mb-1 text-[11px] text-[var(--color-muted-foreground)]">
          {loading && '正在格式化…'}
          {parseError && `不是合法 JSON：${parseError}（按原文本显示）`}
          {len > FORMAT_MAX_BYTES && !loading && !parseError && (
            <span>大文本（{(len / 1024 / 1024).toFixed(1)} MB），未做格式化以保流畅</span>
          )}
        </div>
      )}
      <CodeMirror
        value={display || value}
        extensions={extensions}
        theme={dark ? 'dark' : 'light'}
        readOnly editable={false}
        maxHeight={maxHeight}
        basicSetup={{
          lineNumbers: true,
          foldGutter: useHighlight,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          autocompletion: false,
          indentOnInput: false,
        }}
      />
    </div>
  )
}
