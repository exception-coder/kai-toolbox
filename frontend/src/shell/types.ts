import type { ReactElement } from 'react'

export interface FeatureRoute {
  path: string
  element: ReactElement
}

export interface FeatureManifest {
  id: string
  routes: FeatureRoute[]
}

export interface ToolDescriptor {
  id: string
  name: string
  icon: string
  route: string
  group: string | null
  description: string | null
  order: number
}
