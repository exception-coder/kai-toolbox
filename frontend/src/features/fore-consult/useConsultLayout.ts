import { useSyncExternalStore } from 'react'
const query = '(max-width: 1023px)'
const phoneQuery = '(max-width: 767px)'
function subscribe(listener: () => void) {
  const media = window.matchMedia?.(query)
  const phone = window.matchMedia?.(phoneQuery)
  media?.addEventListener('change', listener); phone?.addEventListener('change', listener)
  return () => { media?.removeEventListener('change', listener); phone?.removeEventListener('change', listener) }
}
function snapshot() { return window.matchMedia?.(phoneQuery).matches ? 'phone' : window.matchMedia?.(query).matches ? 'tablet' : 'desktop' }
export function useConsultLayout() {
  const layout = useSyncExternalStore(subscribe, snapshot, () => 'desktop')
  return { layout, compact: layout !== 'desktop', phone: layout === 'phone' }
}
