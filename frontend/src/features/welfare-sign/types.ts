export type LoginMode = 'SMS' | 'PASSWORD'

/**
 * 页面主题（配色 + 关键文案）。仅演示沙箱用：注入后 WelfareSignPage 以 CSS 变量覆盖写死配色，
 * 真实页不传则按默认端午绿。各字段对应组件里的 var(--wf-*) 兜底色。
 */
export interface WelfareTheme {
  accent: string      // --wf-accent  强调/图标/eyebrow/分隔线
  buttonBg: string    // --wf-btn     主按钮底
  buttonHover: string // --wf-btn-hover
  buttonText: string  // --wf-btn-text
  stageBg: string     // --wf-stage   舞台/背景深底
  panelBg: string     // --wf-panel   面板深底
  eyebrow: string     // 顶部 eyebrow 文案
  ctaLabel: string    // 「领取福利」按钮文案
  backdropImage: string  // 背景图 URL（公共资源路径或外链）
  conciergeImage: string // 聊天框吉祥物图 URL
}

export interface WelfareConfig {
  loginMode: LoginMode
  redirectUrl: string | null
  loginImageUrl: string | null
  detailImageUrl: string | null
  detailTitle: string
  detailContent: string | null
  popupEnabled: boolean
  popupTitle: string | null
  popupContent: string | null
  signatureNotice: string | null
  extraFieldsJson: string | null
  updatedAt: number
}

export interface EmployeeView {
  id: number
  employeeNo: string
  name: string
  phone: string | null
  account: string | null
  department: string | null
  extraJson: string | null
  enabled: boolean
  createdAt: number
  updatedAt: number
  signed: boolean
  signedAt: number | null
}

export interface EmployeePayload {
  employeeNo: string
  name: string
  phone?: string
  account?: string
  password?: string
  department?: string
  extraJson?: string
  enabled: boolean
}

export interface LoginResponse {
  employee: EmployeeView
  config: WelfareConfig
}

export interface SignRecordView {
  id: number
  employeeId: number
  employeeNo: string
  name: string
  phone: string | null
  department: string | null
  signatureData: string
  extraJson: string | null
  signedAt: number
  ip: string | null
  userAgent: string | null
}

export interface ExtraField {
  key: string
  label: string
  type?: 'text' | 'number' | 'date'
  required?: boolean
}
