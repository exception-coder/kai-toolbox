import { Navigate, useLocation } from 'react-router-dom'

/** 保留历史链接和查询参数，统一进入现有需求权限边界。 */
export function DeliveryCenterPage() {
  const location = useLocation()
  return <Navigate to={{ pathname: '/tools/reqpool', search: location.search, hash: location.hash }} state={location.state} replace />
}
