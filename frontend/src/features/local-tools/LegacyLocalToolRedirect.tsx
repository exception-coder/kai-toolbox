import { Navigate, useLocation } from 'react-router-dom'
import { localToolLocation } from './navigation'

export function LegacyLocalToolRedirect({ tool }: { tool: string }) {
  const location = useLocation()
  return <Navigate replace to={{ ...localToolLocation(location.search, tool), hash: location.hash }} />
}
