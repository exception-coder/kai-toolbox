export type LoginMode = 'SMS' | 'PASSWORD'

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
