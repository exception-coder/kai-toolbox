// 简历预览渲染器：根据 template id 切换模板组件，统一固定 A4 像素宽
import { forwardRef } from 'react'
import { ClassicTemplate } from './templates/ClassicTemplate'
import { SidebarTemplate } from './templates/SidebarTemplate'
import { MinimalTemplate } from './templates/MinimalTemplate'
import { GradientTemplate } from './templates/GradientTemplate'
import { TimelineTemplate } from './templates/TimelineTemplate'
import { ACCENT_COLORS } from '../types'
import type { AccentColor, ResumeData, TemplateId } from '../types'

interface ResumePreviewProps {
  data: ResumeData
  template: TemplateId
  accent: AccentColor
}

export const ResumePreview = forwardRef<HTMLDivElement, ResumePreviewProps>(
  ({ data, template, accent }, ref) => {
    const hex = ACCENT_COLORS.find(c => c.id === accent)?.hex ?? '#4f46e5'
    return (
      <div
        ref={ref}
        className="resume-canvas"
        data-resume-template={template}
        style={{ ['--accent' as string]: hex } as React.CSSProperties}
      >
        {renderTemplate(template, data)}
      </div>
    )
  },
)
ResumePreview.displayName = 'ResumePreview'

function renderTemplate(id: TemplateId, data: ResumeData) {
  switch (id) {
    case 'sidebar':
      return <SidebarTemplate data={data} />
    case 'minimal':
      return <MinimalTemplate data={data} />
    case 'gradient':
      return <GradientTemplate data={data} />
    case 'timeline':
      return <TimelineTemplate data={data} />
    case 'classic':
    default:
      return <ClassicTemplate data={data} />
  }
}
