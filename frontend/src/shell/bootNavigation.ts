import { hasFeatureAccess } from './access'
import { migrateVisibleMenus } from './menuMigration'
import type { FeatureManifest } from './types'

type BootFeature = Pick<FeatureManifest, 'id' | 'name' | 'entry' | 'group' | 'description' | 'defaultVisible' | 'replacesMenus' | 'controlPermissions' | 'requiredPermission'>

/** Runs inline before the React module graph; metadata and access rules come from the normal menu. */
export function mountBootNavigation() {
  if (location.pathname !== '/') return
  const source = document.getElementById('boot-navigation-data')
  const nav = document.getElementById('boot-navigation')
  if (!source || !nav) return
  try {
    const features = JSON.parse(source.textContent || '[]') as BootFeature[]
    const visible = visibleBootFeatures(features).sort((a, b) => Number(b.id === 'claude-chat') - Number(a.id === 'claude-chat'))
    if (!visible.length) return
    const groups = new Map<string, HTMLElement>()
    for (const feature of visible) {
      if (!feature.entry?.startsWith('/') || feature.entry.startsWith('//')) continue
      const group = feature.group || '其他'
      let list = groups.get(group)
      if (!list) {
        const section = document.createElement('section')
        const heading = document.createElement('h2')
        heading.textContent = group
        list = document.createElement('ul')
        section.append(heading, list)
        nav.append(section)
        groups.set(group, list)
      }
      const item = document.createElement('li')
      const link = document.createElement('a')
      link.href = feature.entry
      link.textContent = feature.name
      item.append(link)
      list.append(item)
    }
    if (!nav.childElementCount) return
    nav.hidden = false
    document.getElementById('boot-title')!.textContent = '工作台'
    document.getElementById('boot-description')!.textContent = '选择功能，继续工作。'
    document.getElementById('boot-progress')!.textContent = '正在连接工作台，菜单已可使用。'
    document.documentElement.dataset.homeMenuReadyMs = String(Math.round(performance.now()))
  } catch (error) {
    console.warn('[boot-navigation] 无法读取本地菜单快照，等待主应用接管', error)
  }
}

function visibleBootFeatures(features: BootFeature[]): BootFeature[] {
  const user = JSON.parse(localStorage.getItem('toolbox.auth.user') || 'null')
  if (!localStorage.getItem('toolbox.auth.token') || !Array.isArray(user?.roles)) return []
  const permissions = JSON.parse(localStorage.getItem('toolbox.auth.perms') || '[]')
  const rawVisible = JSON.parse(localStorage.getItem('kai-toolbox:menu-visible-ids') || 'null')
  const visible = Array.isArray(rawVisible)
    ? new Set(migrateVisibleMenus(rawVisible.filter((id): id is string => typeof id === 'string'), features))
    : new Set(features.filter(feature => feature.defaultVisible !== false).map(feature => feature.id))
  const access = { roles: user.roles.filter((role: unknown): role is string => typeof role === 'string'),
    permissionCodes: Array.isArray(permissions) ? permissions : [], superAdmin: localStorage.getItem('toolbox.auth.superAdmin') === 'true' }
  return features.filter(feature => visible.has(feature.id) && hasFeatureAccess(feature, access))
}

mountBootNavigation()
