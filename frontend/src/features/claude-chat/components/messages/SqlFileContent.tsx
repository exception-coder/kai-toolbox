import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { sql } from '@codemirror/lang-sql'
import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { useIsDarkTheme } from '@/lib/useIsDarkTheme'

export function SqlFileContent({ content }: { content: string }) {
  const dark = useIsDarkTheme()
  const extensions = useMemo(() => [sql(), EditorView.lineWrapping,
    EditorView.theme({
      '&': { backgroundColor: 'var(--color-card)', color: 'var(--color-foreground)' },
      '.cm-gutters': { backgroundColor: 'var(--color-background)', color: 'var(--color-muted-foreground)', borderColor: 'var(--color-border)' },
      '.cm-content': { caretColor: 'var(--color-primary)' },
    }),
    syntaxHighlighting(HighlightStyle.define([
      { tag: tags.keyword, color: 'var(--wb-keyword, var(--color-primary))' },
      { tag: tags.string, color: 'var(--wb-string, var(--color-success))' },
      { tag: [tags.number, tags.bool], color: 'var(--wb-accent, var(--color-info))' },
      { tag: tags.comment, color: 'var(--color-muted-foreground)', fontStyle: 'italic' },
    ])),
    EditorView.contentAttributes.of({ 'aria-label': 'SQL 文件内容', tabindex: '0' })], [])
  return <CodeMirror value={content} theme={dark ? 'dark' : 'light'} height="100%" className="h-full text-sm" extensions={extensions}
    readOnly editable={false} indentWithTab={false} basicSetup={{ lineNumbers: true, highlightActiveLine: false, highlightActiveLineGutter: false, autocompletion: false }} />
}
