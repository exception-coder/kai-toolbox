import { matchPath } from 'react-router-dom'
import { featuresWithMock } from '@/lib/mock/loader'
import type { FeatureManifest } from './types'

const modules = import.meta.glob<{ default: FeatureManifest }>(
  '../features/*/index.tsx',
  { eager: true }
)

export const features: FeatureManifest[] = Object.values(modules)
  .map(m => m.default)
  .filter(Boolean)
  // 代码级隐藏（manifest.hidden）：整体剔除——不注册路由、不进任何菜单面，只能改源码 hidden:false 恢复。
  // 与用户在「菜单配置」里勾掉的软隐藏不同（后者仅隐藏菜单入口、路由仍在，见 shell/menuVisibility）。
  .filter(f => !f.hidden)
  .sort((a, b) => (a.order ?? 100) - (b.order ?? 100) || a.name.localeCompare(b.name))

export function entryOf(f: FeatureManifest): string {
  return f.entry ?? f.routes[0]?.path ?? '/'
}

/** 按当前路径匹配出所属 feature（含动态路由 /:id、/* 等）。 */
export function featureAtPath(pathname: string): FeatureManifest | undefined {
  return features.find(f => f.routes.some(r => matchPath({ path: r.path, end: true }, pathname)))
}

/** 当前路径所属模块是否实现了 mock。首页等无归属路径返回 false。 */
export function pathHasMock(pathname: string): boolean {
  const f = featureAtPath(pathname)
  return f ? featuresWithMock.has(f.id) : false
}

/** 当前路径是否属于展示型外壳（layout: 'showcase'）。基于注册表判定，不硬编码 /showcase 前缀。 */
export function isShowcasePath(pathname: string): boolean {
  return featureAtPath(pathname)?.layout === 'showcase'
}
