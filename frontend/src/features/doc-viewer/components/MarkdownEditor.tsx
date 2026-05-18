import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { markdown } from '@codemirror/lang-markdown'
import type { Extension } from '@codemirror/state'
import { useIsDarkTheme } from '@/lib/useIsDarkTheme'

interface MarkdownEditorProps {
  value: string
  onChange: (next: string) => void
  // Ctrl/Cmd+S 保存快捷键
  onSave?: () => void
  readOnly?: boolean
}

const cmTheme = EditorView.theme({
  '&': { fontSize: '13px', height: '100%' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
  '.cm-content': { padding: '12px 4px' },
})

export function MarkdownEditor({ value, onChange, onSave, readOnly = false }: MarkdownEditorProps) {
  const dark = useIsDarkTheme()

  const extensions = useMemo<Extension[]>(() => {
    const exts: Extension[] = [
      cmTheme,
      EditorView.lineWrapping,
      markdown(),
    ]
    if (onSave) {
      exts.push(
        EditorView.domEventHandlers({
          keydown(e) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
              e.preventDefault()
              onSave()
              return true
            }
            return false
          },
        }),
      )
    }
    return exts
  }, [onSave])

  return (
    <CodeMirror
      value={value}
      extensions={extensions}
      theme={dark ? 'dark' : 'light'}
      readOnly={readOnly}
      editable={!readOnly}
      height="100%"
      basicSetup={{
        lineNumbers: true,
        foldGutter: true,
        highlightActiveLine: !readOnly,
        highlightActiveLineGutter: !readOnly,
        autocompletion: false,
        indentOnInput: true,
        bracketMatching: true,
      }}
      onChange={onChange}
      style={{ height: '100%' }}
    />
  )
}
