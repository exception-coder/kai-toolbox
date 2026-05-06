export interface MailListItem {
  id: string
  fromAddr: string
  toAddr: string
  subject: string | null
  receivedAt: number
  read: boolean
  hasAttachment: boolean
  rawSize: number | null
}

export interface MailAttachment {
  filename: string
  mimeType: string
  size: number
}

export interface MailDetail {
  id: string
  messageId: string | null
  fromAddr: string
  toAddr: string
  subject: string | null
  bodyText: string | null
  bodyHtml: string | null
  attachments: MailAttachment[]
  receivedAt: number
  read: boolean
  rawSize: number | null
}

export interface MailListResponse {
  items: MailListItem[]
  total: number
  page: number
  size: number
  unreadCount: number
}

export interface MailStats {
  total: number
  unreadCount: number
}
