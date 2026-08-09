import {
  FileSpreadsheet,
  GitBranch,
  Globe2,
  Monitor,
  Network,
  PanelsTopLeft,
  Rocket,
  Server,
  type LucideIcon,
} from 'lucide-react'

export const SITE_ICON_OPTIONS: ReadonlyArray<{ value: string; label: string; icon: LucideIcon }> = [
  { value: 'Globe2', label: '网站', icon: Globe2 },
  { value: 'Monitor', label: '本地调试', icon: Monitor },
  { value: 'FileSpreadsheet', label: '表格', icon: FileSpreadsheet },
  { value: 'Server', label: '服务', icon: Server },
  { value: 'GitBranch', label: '代码仓库', icon: GitBranch },
  { value: 'Network', label: '配置中心', icon: Network },
  { value: 'PanelsTopLeft', label: '工作平台', icon: PanelsTopLeft },
  { value: 'Rocket', label: '快捷启动', icon: Rocket },
]

const ICONS = new Map(SITE_ICON_OPTIONS.map(option => [option.value, option.icon]))

/** 将快捷入口保存的图标名称解析为安全的 Lucide 图标。 */
export function resolveSiteIcon(name: string): LucideIcon {
  return ICONS.get(name) ?? Globe2
}
