import type { ComponentType, ReactElement } from 'react'
import type { LucideProps } from 'lucide-react'

export interface FeatureRoute {
  path: string
  element: ReactElement
}

export interface FeatureManifest {
  id: string
  name: string
  icon: ComponentType<LucideProps>
  /** 主入口路由（用于侧边栏链接），如未提供则取 routes[0].path */
  entry?: string
  group?: string
  description?: string
  order?: number
  routes: FeatureRoute[]
}
