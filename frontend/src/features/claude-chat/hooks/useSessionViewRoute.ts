import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import type { SessionView } from '../components/SessionViewTabs'

/** 先消费新的深链接意图，再清理用户主动离开的视图参数，防止同轮 effect 抹掉记录编号。 */
export function useSessionViewRoute(options: {
  pathname: string; search: string; view: SessionView
  setView: Dispatch<SetStateAction<SessionView>>; navigate: NavigateFunction
}) {
  const { pathname, search, view, setView, navigate } = options
  const consumedSearch = useRef(search)
  useEffect(() => {
    const params = new URLSearchParams(search), target = params.get('view')
    const routed = target === 'supervision' || target === 'communications'
    if (consumedSearch.current !== search) {
      consumedSearch.current = search
      if (routed) setView(target)
      return
    }
    if (!routed || target === view) return
    params.delete('view'); params.delete('recordId')
    navigate({ pathname, search: params.toString() }, { replace: true })
  }, [pathname, search, view, setView, navigate])
}
