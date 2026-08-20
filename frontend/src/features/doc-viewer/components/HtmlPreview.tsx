interface HtmlPreviewProps {
  sourceId: string
  filePath: string
  revision: number
  dirty: boolean
}

export function HtmlPreview({ sourceId, filePath, revision, dirty }: HtmlPreviewProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {dirty && (
        <div className="shrink-0 border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
          预览显示已保存版本，保存文件后自动刷新
        </div>
      )}
      <iframe
        className="block min-h-0 w-full flex-1 border-0 bg-white"
        src={buildPreviewFileUrl(sourceId, filePath, revision)}
        sandbox="allow-scripts"
        title={`${filePath} HTML 预览`}
      />
    </div>
  )
}

export function buildPreviewFileUrl(sourceId: string, filePath: string, revision: number): string {
  const encodedPath = filePath
    .split('/')
    .filter(Boolean)
    .map(encodeURIComponent)
    .join('/')
  return `/api/doc-viewer/local/sources/${encodeURIComponent(sourceId)}/preview/${encodedPath}?v=${revision}`
}
