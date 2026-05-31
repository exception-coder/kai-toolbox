import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, type Ref } from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { json } from '@codemirror/lang-json'
import { xml } from '@codemirror/lang-xml'
import { yaml } from '@codemirror/lang-yaml'
import { sql } from '@codemirror/lang-sql'
import { useIsDarkTheme } from '@/lib/useIsDarkTheme'

export type EditorLanguage = 'json' | 'xml' | 'yaml' | 'sql'

export interface CodeEditorRef {
  getValue: () => string
  setValue: (v: string) => void
  /** 将光标 / 选区跳到 doc.toString() 的字符位置，便于错误定位。 */
  focusError: (pos: number) => void
  /** 选中 [from, to) 范围并把它滚到视口中，给跨视图跳转用。 */
  focusAt: (from: number, to: number) => void
}

interface CodeEditorProps {
  /** 仅在挂载时一次性写入，后续靠 ref.setValue 改值；避免巨型字符串绑到 React state。 */
  defaultValue?: string
  readOnly?: boolean
  placeholder?: string
  minHeight?: string
  /** 显式给 maxHeight 才能让 CodeMirror 在父容器内出现内部滚动条；想撑满父高就传 '100%'。 */
  maxHeight?: string
  /** 语言扩展；切到 false 时按纯文本显示。 */
  language?: EditorLanguage
  /** 是否启用语法高亮 + 折叠 + 括号匹配；超大文本由上层切到 false 保证流畅。 */
  highlight?: boolean
  /** 200ms debounce 上报当前字节长度，供 UI 显示和阈值判断。 */
  onBytesChange?: (bytes: number) => void
}

/** 字号对齐项目其他 pre 块；字体走 monospace 栈。 */
const cmFontTheme = EditorView.theme({
  '&': { fontSize: '12px' },
  '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
})

function pickLangExt(lang: EditorLanguage): Extension {
  switch (lang) {
    case 'json':
      return json()
    case 'xml':
      return xml()
    case 'yaml':
      return yaml()
    case 'sql':
      return sql()
  }
}

function CodeEditorImpl(
  {
    defaultValue = '',
    readOnly = false,
    placeholder,
    minHeight = '240px',
    maxHeight,
    language = 'json',
    highlight = true,
    onBytesChange,
  }: CodeEditorProps,
  ref: Ref<CodeEditorRef>,
) {
  const dark = useIsDarkTheme()
  const cmRef = useRef<ReactCodeMirrorRef>(null)
  const debounceRef = useRef<number | null>(null)
  const onBytesChangeRef = useRef(onBytesChange)
  onBytesChangeRef.current = onBytesChange

  const extensions = useMemo<Extension[]>(() => {
    const exts: Extension[] = [cmFontTheme, EditorView.lineWrapping]
    if (highlight) exts.push(pickLangExt(language))
    return exts
  }, [highlight, language])

  useImperativeHandle(
    ref,
    () => ({
      getValue: () => cmRef.current?.view?.state.doc.toString() ?? '',
      setValue: (v: string) => {
        const view = cmRef.current?.view
        if (!view) return
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } })
        // setValue 是程序化写入（如格式化结果回填），立即上报字节数，让复制/下载按钮即时可用；
        // CodeMirror updateListener 之后还会再 debounce 上报一次，但值相同 setState 会被 bail out。
        if (onBytesChangeRef.current) onBytesChangeRef.current(new Blob([v]).size)
      },
      focusError: (pos: number) => {
        const view = cmRef.current?.view
        if (!view) return
        const safe = Math.min(Math.max(0, pos), view.state.doc.length)
        view.dispatch({ selection: { anchor: safe } })
        view.focus()
      },
      focusAt: (from: number, to: number) => {
        const view = cmRef.current?.view
        if (!view) return
        const docLen = view.state.doc.length
        const safeFrom = Math.min(Math.max(0, from), docLen)
        const safeTo = Math.min(Math.max(safeFrom, to), docLen)
        view.dispatch({
          selection: { anchor: safeFrom, head: safeTo },
          effects: EditorView.scrollIntoView(safeFrom, { y: 'center' }),
        })
        view.focus()
      },
    }),
    [],
  )

  const handleChange = useCallback((value: string) => {
    if (!onBytesChangeRef.current) return
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      onBytesChangeRef.current?.(new Blob([value]).size)
    }, 200)
  }, [])

  useEffect(() => {
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <CodeMirror
      ref={cmRef}
      // 仅在挂载时作为初始 doc；后续值由 ref.setValue 写入。
      // 上层 panel 不会改这个 prop（始终传相同字符串引用语义），不会触发 lib 内部 dispatch。
      value={defaultValue}
      extensions={extensions}
      theme={dark ? 'dark' : 'light'}
      readOnly={readOnly}
      editable={!readOnly}
      placeholder={placeholder}
      minHeight={minHeight}
      maxHeight={maxHeight}
      height={maxHeight}
      basicSetup={{
        lineNumbers: true,
        foldGutter: highlight,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: false,
        indentOnInput: false,
        bracketMatching: highlight,
      }}
      onChange={handleChange}
    />
  )
}

export const CodeEditor = forwardRef<CodeEditorRef, CodeEditorProps>(CodeEditorImpl)
