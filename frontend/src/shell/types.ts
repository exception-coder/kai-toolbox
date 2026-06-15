import type { ComponentType, ReactElement } from 'react'
import type { LucideProps } from 'lucide-react'

export interface FeatureRoute {
  path: string
  element: ReactElement
}

/**
 * 模块外壳布局：
 *   'tool'（默认）—— 走 AppShell（Sidebar + TopBar），工具工作台风格。
 *   'showcase'    —— 走 ShowcaseLayout（全屏无侧边栏，仅悬浮返回 + 主题），
 *                    用于 Hero / 信息图 / 架构蓝图等「讲故事」的展示页，公开免登录。
 */
export type FeatureLayout = 'tool' | 'showcase'

export interface FeatureManifest {
  id: string
  name: string
  icon: ComponentType<LucideProps>
  /** 主入口路由（用于侧边栏链接），如未提供则取 routes[0].path */
  entry?: string
  group?: string
  description?: string
  order?: number
  /** 外壳布局，默认 'tool'。'showcase' 的路由会脱离 AppShell、全屏渲染且不鉴权。 */
  layout?: FeatureLayout
  routes: FeatureRoute[]
}
