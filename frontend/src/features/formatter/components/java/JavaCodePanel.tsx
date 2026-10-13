import { useRef, useState } from 'react'
import type { CodeEditorRef } from '../CodeEditor'
import { JavaToolbar } from './JavaToolbar'
import { JavaEditorPane } from './JavaEditorPane'
import { useJavaFormatter } from '../../lib/java/useJavaFormatter'
import { useJavaResultActions } from '../../lib/java/useJavaResultActions'
import { JAVA_MAX_BYTES } from '../../lib/java/contracts'

export function JavaCodePanel({ active = true }: { active?: boolean }) {
  const inputRef = useRef<CodeEditorRef>(null)
  const outputRef = useRef<CodeEditorRef>(null)
  const format = useJavaFormatter(inputRef, outputRef, active)
  const actions = useJavaResultActions(outputRef, format.valid)
  const [pane, setPane] = useState<'input' | 'output'>('input')
  const [wrap, setWrap] = useState(true)
  const run = async () => {
    setPane('input')
    if (await format.run()) setPane('output')
  }
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3" onKeyDownCapture={event => {
    if (active && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); void run() }
  }}>
    <JavaToolbar options={format.options} onOptionsChange={format.changeOptions} busy={format.busy}
      valid={format.valid} onFormat={() => void run()} onCancel={format.cancel}
      onCopy={() => { setPane('output'); void actions.copy() }} onDownload={actions.download}
      copied={actions.feedback.startsWith('已复制')} wrap={wrap} onWrapChange={setWrap} />
    <div className="flex shrink-0 items-center justify-between gap-3 border-t pt-3 text-xs lg:hidden">
      <div className="flex gap-1" aria-label="Java 阅读区域">
        {(['input', 'output'] as const).map(value => <button key={value} type="button" aria-pressed={pane === value}
          className="min-h-9 rounded-md px-3 hover:bg-[var(--color-accent)] aria-pressed:bg-[var(--color-muted)] focus-visible:outline focus-visible:outline-2"
          onClick={() => setPane(value)}>{value === 'input' ? '原始代码' : '格式化结果'}</button>)}
      </div>
      <label className="flex min-h-9 items-center gap-2"><input type="checkbox" checked={wrap} onChange={event => setWrap(event.target.checked)} />自动换行</label>
    </div>
    <div className="flex min-h-0 min-w-0 flex-1 gap-4 lg:border-t lg:pt-3">
      <JavaEditorPane kind="input" editorRef={inputRef} wrap={wrap} visible={pane === 'input'} onChange={format.changeInput} highlight={format.inputBytes <= JAVA_MAX_BYTES}
        meta={format.inputBytes < 1024 ? `${format.inputBytes} B` : `${(format.inputBytes / 1024).toFixed(1)} KB`} />
      <JavaEditorPane kind="output" editorRef={outputRef} wrap={wrap} visible={pane === 'output'}
        meta={format.resultMeta ? format.valid ? format.resultMeta : '上一份结果 · 请重新格式化' : '等待格式化'} />
    </div>
    <div className="shrink-0 text-xs leading-relaxed">
      {format.error ? <p role="alert" className="text-[var(--color-destructive)]">{format.error}</p>
        : <p role="status" aria-live="polite" className="text-[var(--color-muted-foreground)]">{actions.feedback || format.status}</p>}
    </div>
  </div>
}
