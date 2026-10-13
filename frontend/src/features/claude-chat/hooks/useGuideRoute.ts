import { useEffect, useRef } from 'react'
import type { NavigateFunction } from 'react-router-dom'

/** 一次性阅读意图：消费后移除参数，刷新和后退不会重新打开导览。 */
export function useGuideRoute(location: { pathname: string; search: string; hash: string }, navigate: NavigateFunction, onOpen: () => void) {
  const consumed = useRef<string | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('guide') !== '1') { consumed.current = null; return }
    if (consumed.current === location.search) return
    consumed.current = location.search
    params.delete('guide')
    onOpen()
    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true })
  }, [location.pathname, location.search, location.hash, navigate, onOpen])
}
