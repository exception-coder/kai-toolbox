import { useCallback, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PagePreviewWorkspace } from './PagePreviewWorkspace'
import { previewTargetFromSearch } from './previewEntry'
import type { PreviewView } from './api'

export function PagePreviewPage() {
  const { previewId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const initial = useMemo(() => previewTargetFromSearch(params), [params])
  const onOpened = useCallback((view: PreviewView) => navigate(view.viewerPath, { replace: true }), [navigate])
  return <PagePreviewWorkspace key={initial.requestKey} initial={initial} previewId={previewId} onOpened={onOpened} autoStart={params.get('auto') === '1'} />
}
