import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import { EditorView } from '@codemirror/view'
import { useIsDarkTheme } from '@/lib/useIsDarkTheme'

export function SqlFileContent({ content }: { content: string }) {
  const dark = useIsDarkTheme()
  const extensions = useMemo(() => [sql(), EditorView.lineWrapping,
    EditorView.contentAttributes.of({ 'aria-label': 'SQL 文件内容', tabindex: '0' })], [])
  return <CodeMirror value={content} theme={dark ? 'dark' : 'light'} height="100%" className="h-full text-sm" extensions={extensions}
    readOnly editable={false} indentWithTab={false} basicSetup={{ lineNumbers: true, highlightActiveLine: false, highlightActiveLineGutter: false, autocompletion: false }} />
}
