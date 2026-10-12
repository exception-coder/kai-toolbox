import { lazy, Suspense, useRef } from 'react'
import { BROWSER_FILE_ACCEPT } from './browserDocument'
import { FileDropArea } from './FileDropArea'
import { useBrowserDocuments } from './useBrowserDocuments'

const BrowserDocumentDialog = lazy(() => import('./BrowserDocumentDialog').then(module => ({ default: module.BrowserDocumentDialog })))

export function QuickFilePreview() {
  const files = useBrowserDocuments()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const chooseFiles = () => inputRef.current?.click()

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={BROWSER_FILE_ACCEPT}
        aria-label="打开文档文件"
        className="hidden"
        onChange={event => {
          const selected = Array.from(event.currentTarget.files ?? [])
          event.currentTarget.value = ''
          if (selected.length) void files.openFiles(selected)
        }}
      />
      <FileDropArea onFiles={selected => { void files.openFiles(selected) }} onChoose={chooseFiles} buttonRef={buttonRef} />
      {files.open && (
        <Suspense fallback={<p role="status" className="text-sm">正在打开文件预览…</p>}>
          <BrowserDocumentDialog files={files} onChoose={chooseFiles} onReturnFocus={() => buttonRef.current?.focus()} />
        </Suspense>
      )}
    </>
  )
}
