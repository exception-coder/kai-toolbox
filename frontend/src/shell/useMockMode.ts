import { useEffect, useState } from 'react'
import { isMockEnabled, onMockToggle, setMockEnabled } from '@/lib/mock/mode'

export function useMockMode() {
  const [enabled, setEnabled] = useState(isMockEnabled)
  useEffect(() => onMockToggle(setEnabled), [])
  return { enabled, toggle: () => setMockEnabled(!enabled), set: setMockEnabled }
}
