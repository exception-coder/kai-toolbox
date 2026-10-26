import { lazy, Suspense } from 'react'
export { pagePreviewEntryFromHref } from '../preview/previewEntry'

const Dialog = lazy(() => import('../preview/PagePreviewDialog').then(module => ({ default: module.PagePreviewDialog })))
export function PagePreviewDialog(props: { entryPath: string; onClose: () => void; returnFocus: () => void }) {
  return <Suspense fallback={<p role="status">正在打开登录预览…</p>}><Dialog {...props} /></Suspense>
}
