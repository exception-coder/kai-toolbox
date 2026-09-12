import { Navigate, useSearchParams } from 'react-router-dom'

export function LegacyRouteRedirect() {
  const [params] = useSearchParams()
  const destination = new URLSearchParams(params)
  destination.set('section', 'diagnostics')
  return <Navigate to={`/tools/project-workspace?${destination}`} replace />
}
