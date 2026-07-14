import { lazy } from 'react'
import { ListChecks } from 'lucide-react'
import type { FeatureManifest } from '@/shell/types'

const MenuSettingsPage = lazy(() =>
  import('./pages/MenuSettingsPage').then((m) => ({ default: m.MenuSettingsPage }))
)

const manifest: FeatureManifest = {
  id: 'menu-settings',
  name: '菜单配置',
  icon: ListChecks,
  // 平台管理能力，非 Vibe 工具：不进侧栏功能菜单，改由左下账号菜单（更多）呈现。
  chrome: true,
  description: '勾选展示/隐藏各模块的菜单入口（软隐藏，存本机）',
  order: 7,
  routes: [{ path: '/tools/menu-settings', element: <MenuSettingsPage /> }],
}

export default manifest
