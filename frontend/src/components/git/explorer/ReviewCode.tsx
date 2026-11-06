import { useEffect, useMemo, useRef } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorState } from '@codemirror/state'
import { EditorView, lineNumbers } from '@codemirror/view'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { MergeView, unifiedMergeView } from '@codemirror/merge'
import { java } from '@codemirror/lang-java'
import { javascript } from '@codemirror/lang-javascript'
import { xml } from '@codemirror/lang-xml'
import { sql } from '@codemirror/lang-sql'
import { json } from '@codemirror/lang-json'
import { css } from '@codemirror/lang-css'
import { yaml } from '@codemirror/lang-yaml'
import { markdown } from '@codemirror/lang-markdown'
import { useIsDarkTheme } from '@/lib/useIsDarkTheme'

function language(path: string) {
  const ext = path.split('.').pop()?.toLowerCase()
  if (ext === 'java') return java()
  if (['js', 'jsx', 'ts', 'tsx', 'mjs'].includes(ext ?? '')) return javascript({ typescript: ext === 'ts' || ext === 'tsx', jsx: ext === 'jsx' || ext === 'tsx' })
  if (ext === 'xml' || ext === 'html') return xml()
  if (ext === 'sql') return sql()
  if (ext === 'json') return json()
  if (ext === 'css') return css()
  if (ext === 'yaml' || ext === 'yml') return yaml()
  if (ext === 'md' || ext === 'mdx') return markdown()
  return []
}
const surface = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--color-background)', color: 'var(--color-foreground)' },
  '.cm-scroller': { overflow: 'auto', fontSize: '13px', fontFamily: 'var(--font-mono, monospace)' },
  '.cm-gutters': { backgroundColor: 'var(--color-muted)', color: 'var(--color-muted-foreground)', borderColor: 'var(--color-border)' },
})

/** Only view state is created. Neither side exposes editing, accept/reject, or file writes. */
export function ReviewCode({ path, before, after, mode }: { path: string; before: string; after: string; mode: 'source' | 'unified' | 'split' }) {
  const dark = useIsDarkTheme()
  const parent = useRef<HTMLDivElement>(null)
  const extensions = useMemo(() => [language(path), surface, EditorState.readOnly.of(true), EditorView.editable.of(false)], [path])
  useEffect(() => {
    if (mode !== 'split' || !parent.current) return
    const view = new MergeView({ parent: parent.current,
      a: { doc: before, extensions: [...extensions, lineNumbers(), syntaxHighlighting(defaultHighlightStyle), EditorView.contentAttributes.of({ 'aria-label': '修改前代码', tabindex: '0' })] },
      b: { doc: after, extensions: [...extensions, lineNumbers(), syntaxHighlighting(defaultHighlightStyle), EditorView.contentAttributes.of({ 'aria-label': '修改后代码', tabindex: '0' })] },
      highlightChanges: true, gutter: true, diffConfig: { scanLimit: 500 },
    })
    return () => view.destroy()
  }, [mode, before, after, extensions, dark])
  const unified = useMemo(() => mode === 'unified' ? unifiedMergeView({ original: before, mergeControls: false,
    syntaxHighlightDeletions: true, diffConfig: { scanLimit: 500 } }) : [], [mode, before])
  if (mode === 'split') return <div ref={parent} className="pe-code pe-split h-full min-h-0" />
  return <CodeMirror className="pe-code h-full min-h-0" value={after} height="100%" theme={dark ? 'dark' : 'light'}
    extensions={[...extensions, unified, EditorView.contentAttributes.of({ 'aria-label': mode === 'source' ? '文件源码' : '统一代码差异', tabindex: '0' })]}
    readOnly editable={false} indentWithTab={false} basicSetup={{ autocompletion: false, highlightActiveLine: false, highlightActiveLineGutter: false }} />
}
