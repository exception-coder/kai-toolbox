import { Navigate, useLocation } from 'react-router-dom'
import { AGENT_MANAGEMENT_PATH } from '../navigation'

export function LegacyEvaluationRedirect() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  params.set('section', 'evaluation')
  return <Navigate replace to={`${AGENT_MANAGEMENT_PATH}?${params}${location.hash}`} />
}
