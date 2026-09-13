import type { FeatureManifest } from './types'

/** 消费旧 ID 后保存新集合，使用户之后仍能主动隐藏合并入口。 */
export function migrateVisibleMenus(ids: string[], manifests: Pick<FeatureManifest, 'id' | 'replacesMenus'>[]): string[] {
  const visible = new Set(ids)
  for (const feature of manifests) {
    if (!feature.replacesMenus?.some(id => visible.has(id))) continue
    for (const id of feature.replacesMenus) visible.delete(id)
    visible.add(feature.id)
  }
  return [...visible]
}
