import { useEffect, useState } from 'react'

/** 窗口转为桌面布局时关闭移动抽屉，避免不可见弹层仍锁住页面。 */
export function useMobileDisclosure() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const desktop = window.matchMedia?.('(min-width: 768px)')
    if (!desktop) return
    const closeOnDesktop = () => { if (desktop.matches) setOpen(false) }
    closeOnDesktop()
    desktop.addEventListener('change', closeOnDesktop)
    return () => desktop.removeEventListener('change', closeOnDesktop)
  }, [])
  return [open, setOpen] as const
}
