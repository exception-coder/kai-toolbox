import { useSyncExternalStore } from 'react'

const query = '(max-width: 767px)'
function subscribe(listener: () => void) {
  const media = window.matchMedia?.(query)
  media?.addEventListener('change', listener)
  return () => media?.removeEventListener('change', listener)
}
const read = () => Boolean(window.matchMedia?.(query).matches)

/** 与 md 布局断点一致，仅决定呈现，不持有会话状态。 */
export function useMobileViewport() {
  return useSyncExternalStore(subscribe, read, () => false)
}
