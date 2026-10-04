import { useEffect, useState } from 'react'
import { isMockEnabled, onMockToggle, setMockEnabled } from '@/lib/mock/mode'
import { loadFeatureMocks } from '@/lib/mock/loader'

export function useMockMode() {
  const [enabled, setEnabled] = useState(isMockEnabled)
  useEffect(() => onMockToggle(setEnabled), [])
  const set = async (next: boolean) => {
    if (next) await loadFeatureMocks()
    setMockEnabled(next)
  }
  return { enabled, toggle: () => set(!enabled), set }
}
