import { Boxes, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { ProjectModules } from '@/features/claude-chat/public-api'

/** 右上角项目类型标签：标识当前选中项目是什么工程（Maven / Java Web (传统) / Node …）。 */
export function ProjectTypeBadge({ loading, data }: { loading: boolean; data?: ProjectModules }) {
  if (loading) {
    return (
      <Badge variant="outline" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        识别中
      </Badge>
    )
  }
  if (!data || !data.exists) return null
  return (
    <Badge variant={projectTypeBadge(data.projectType)} className="gap-1">
      <Boxes className="h-3.5 w-3.5" />
      {data.projectTypeLabel || '未知'}
    </Badge>
  )
}

function projectTypeBadge(type?: string) {
  switch (type) {
    case 'maven':
    case 'gradle':
      return 'info'
    case 'node':
      return 'success'
    case 'python':
      return 'warning'
    case 'java-web':
    case 'knowledge':
      return 'secondary'
    default:
      return 'outline'
  }
}
