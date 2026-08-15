import { createContext, useContext, type ReactNode } from 'react'

type OpenMobileNavigation = () => void

const MobileNavigationContext = createContext<OpenMobileNavigation | null>(null)

export function MobileNavigationProvider({
  onOpen,
  children,
}: {
  onOpen: OpenMobileNavigation
  children: ReactNode
}) {
  return (
    <MobileNavigationContext.Provider value={onOpen}>
      {children}
    </MobileNavigationContext.Provider>
  )
}

/** Feature headers use this capability to open the Shell-owned mobile navigation sheet. */
export function useMobileNavigation(): OpenMobileNavigation | null {
  return useContext(MobileNavigationContext)
}
