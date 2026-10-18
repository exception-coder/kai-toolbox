import type { ReactNode } from 'react'
import { BrowserRouter } from 'react-router-dom'

/** 先提交目标位置与菜单状态，页面内容交给局部骨架，不等待过渡渲染完成。 */
export function WorkspaceRouter({ children }: { children: ReactNode }) {
  return <BrowserRouter unstable_useTransitions={false}>{children}</BrowserRouter>
}
