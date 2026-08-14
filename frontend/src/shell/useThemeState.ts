import { useSyncExternalStore } from 'react'
import { getServerThemeSnapshot, getThemeSnapshot, subscribeTheme } from './theme'

export function useThemeState() {
  return useSyncExternalStore(subscribeTheme, getThemeSnapshot, getServerThemeSnapshot)
}
