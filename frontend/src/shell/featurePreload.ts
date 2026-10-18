import { Children, isValidElement, type ReactNode } from 'react'
import { matchPath } from 'react-router-dom'
import type { FeatureManifest } from './types'

/** 只遍历声明的元素树，不执行组件；支持 ConfirmProvider 等入口包装。 */
async function preloadElement(node: ReactNode): Promise<void> {
  if (!isValidElement<{ children?: ReactNode }>(node)) return
  const type = node.type as unknown as { preload?: () => Promise<unknown> } | null
  if (typeof type?.preload === 'function') await type.preload()
  await Promise.all(Children.toArray(node.props.children).map(preloadElement))
}

export function canPreloadFeature(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  return !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType ?? '')
}

export async function preloadFeatureEntry(feature: FeatureManifest): Promise<void> {
  if (!canPreloadFeature()) return
  const pathname = (feature.entry ?? feature.routes[0]?.path ?? '/').split(/[?#]/)[0]
  const route = feature.routes.find(item => matchPath({ path: item.path, end: true }, pathname)) ?? feature.routes[0]
  if (route) await preloadElement(route.element)
}
