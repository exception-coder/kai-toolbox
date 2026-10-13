import type { RefObject } from 'react'
import { CodeEditor, type CodeEditorRef } from '../CodeEditor'

interface Props {
  kind: 'input' | 'output'
  editorRef: RefObject<CodeEditorRef | null>
  meta: string
  visible: boolean
  wrap: boolean
  highlight?: boolean
  onChange?: (value: string) => void
}

export function JavaEditorPane({ kind, editorRef, meta, visible, wrap, onChange, highlight = true }: Props) {
  const input = kind === 'input'
  return <section aria-label={input ? 'Java 原文' : 'Java 格式化副本'}
    className={`${visible ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-1 flex-col lg:flex`}>
    <div className="flex shrink-0 items-center justify-between gap-2 pb-2 text-xs">
      <h2 className="font-medium">{input ? '原始代码' : '格式化结果'}</h2>
      <span className="text-[var(--color-muted-foreground)]">{meta}</span>
    </div>
    <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-md border bg-[var(--color-background)]">
      <CodeEditor ref={editorRef} language="java" readOnly={!input} lineWrapping={wrap} highlight={highlight}
        ariaLabel={input ? 'Java 代码输入' : 'Java 格式化结果'} minHeight="100%" maxHeight="100%" onChange={onChange}
        placeholder={input ? '在这里粘贴同事发来的 Java 代码。单个方法也可以直接格式化。' : '点击「格式化」，在这里核对结果。'} />
    </div>
  </section>
}
