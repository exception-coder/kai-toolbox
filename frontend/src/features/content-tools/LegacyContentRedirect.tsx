import { Navigate, useLocation } from 'react-router-dom'
import { contentToolLocation } from './navigation'

export function LegacyContentRedirect({ tool }: { tool: string }) {
  const location = useLocation()
  return <Navigate replace to={{ ...contentToolLocation(location.search, tool), hash: location.hash }} />
}
