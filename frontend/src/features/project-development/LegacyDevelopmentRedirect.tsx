import { Navigate, useLocation } from 'react-router-dom'
import { developmentLocation } from './navigation'

export function LegacyDevelopmentRedirect({ system, adding = false }: { system: string; adding?: boolean }) {
  const location = useLocation()
  return <Navigate replace to={{ ...developmentLocation(location.search, system, adding), hash: location.hash }} />
}
