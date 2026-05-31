// 个人简历模块的数据模型与模板枚举

export type TemplateId =
  | 'classic' // 经典灰底分栏
  | 'sidebar' // 深色左栏 + 右内容
  | 'minimal' // 极简黑白
  | 'gradient' // 渐变彩色卡片
  | 'timeline' // 时间轴样式

export type AccentColor = 'indigo' | 'rose' | 'emerald' | 'amber' | 'slate'

export type ExportFormat = 'png' | 'pdf'

export interface ResumeBasics {
  /** 姓名 */
  name: string
  /** 性别 */
  gender: string
  /** 年龄（字符串便于留空） */
  age: string
  /** 工作年限简述，如「9年工作经验」 */
  experienceYears: string
  /** 求职意向 */
  jobIntent: string
  /** 期望城市 */
  city: string
  /** 联系方式：邮箱 */
  email: string
  /** 联系方式：手机 */
  phone: string
  /** 头像 URL（可选；data:image/* 或 https） */
  avatar: string
  /** 个人优势（一句话或多行） */
  advantage: string
}

export interface WorkExperience {
  id: string
  company: string
  /** 职位 */
  role: string
  /** 起止时间，例如 2018.04-至今 */
  period: string
  /** 工作内容，每行一条 */
  responsibilities: string[]
  /** 业绩，每行一条 */
  achievements: string[]
}

export interface ProjectExperience {
  id: string
  name: string
  /** 担任角色，如「项目负责人」 */
  role: string
  /** 起止时间 */
  period: string
  /** 项目内容 / 描述（可多行） */
  description: string
  /** 关键职责 / 技术要点，每行一条 */
  responsibilities: string[]
  /** 项目业绩，每行一条 */
  achievements: string[]
}

export interface EducationItem {
  id: string
  school: string
  degree: string
  major: string
  /** 起止时间，例如 2014-2018 */
  period: string
}

export interface ResumeData {
  basics: ResumeBasics
  work: WorkExperience[]
  projects: ProjectExperience[]
  education: EducationItem[]
  skills: string[]
}

export interface ResumeState {
  data: ResumeData
  template: TemplateId
  accent: AccentColor
}

export interface TemplateDescriptor {
  id: TemplateId
  label: string
  description: string
  /** 模板预览色，用于选择器小色块 */
  swatch: string
}

export const TEMPLATES: ReadonlyArray<TemplateDescriptor> = [
  { id: 'classic', label: '经典灰栏', description: '左灰右白分栏，正式稳重', swatch: '#9aa3af' },
  { id: 'sidebar', label: '深色左栏', description: '左侧深色信息栏 + 右侧时间线', swatch: '#1f2937' },
  { id: 'minimal', label: '极简黑白', description: '纯黑白排版，简历偏作品集风', swatch: '#111111' },
  { id: 'gradient', label: '渐变彩卡', description: '彩色渐变 Hero + 卡片化模块', swatch: 'linear-gradient(135deg,#6366f1,#ec4899)' },
  { id: 'timeline', label: '时间轴', description: '左侧时间标尺贯穿全文', swatch: '#10b981' },
]

export const ACCENT_COLORS: ReadonlyArray<{ id: AccentColor; label: string; hex: string }> = [
  { id: 'indigo', label: '靛蓝', hex: '#4f46e5' },
  { id: 'rose', label: '玫粉', hex: '#e11d48' },
  { id: 'emerald', label: '翠绿', hex: '#059669' },
  { id: 'amber', label: '琥珀', hex: '#d97706' },
  { id: 'slate', label: '石墨', hex: '#334155' },
]
