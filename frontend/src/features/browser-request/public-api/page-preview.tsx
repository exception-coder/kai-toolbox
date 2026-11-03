import { lazy, Suspense } from 'react'
import type { PreviewView } from '../preview/api'
export { pagePreviewEntryFromHref, inlinePagePreviewEntryFromHref, inlinePagePreviewsSuppressed } from '../preview/previewEntry'
export interface InlinePreviewExpansion { path: string; onClose: () => void; returnFocus: () => void }

const Dialog = lazy(() => import('../preview/PagePreviewDialog').then(module => ({ default: module.PagePreviewDialog })))
export function PagePreviewDialog(props: { entryPath: string; onClose: () => void; returnFocus: () => void; onOpened?: (view: PreviewView) => void }) {
  return <Suspense fallback={<p role="status">正在打开登录预览…</p>}><Dialog {...props} /></Suspense>
}

const Inline = lazy(() => import('../preview/InlinePagePreview').then(module => ({ default: module.InlinePagePreview })))
export function InlinePagePreview(props: { entries: { path: string; label: string }[]; expansion?: InlinePreviewExpansion }) {
  return <Suspense fallback={<p role="status" className="my-3 h-[min(404px,calc(55dvh+44px))] min-h-[244px] border p-3 text-xs">正在准备内嵌页面预览…</p>}><Inline {...props} /></Suspense>
}
