import { useEffect, useState } from 'react'

/** 隐藏页面不再轮询续期；返回前台立即恢复读取。 */
export function usePreviewVisibility() {
  const [visible, setVisible] = useState(() => document.visibilityState !== 'hidden')
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])
  return visible
}
