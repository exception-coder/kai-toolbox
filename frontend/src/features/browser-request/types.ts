export interface SessionView {
  id: string
  name: string
  url: string
  active: boolean
  hasStorage: boolean
  lastActiveAt: number | null
  createdAt: number
  updatedAt: number
  /** storage state 文件字节数，null 表示尚未生成 */
  storageBytes: number | null
  /** storage state 文件最后修改时间（epoch ms），null 表示尚未生成 */
  storageSavedAt: number | null
}

export interface ExecutedResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  rawBodyLength: number
}

export interface ExecuteRequestBody {
  /** 二选一：直接给 curl 文本 */
  curl?: string
  /** 或者结构化字段 */
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
}

export interface SavedRequestView {
  id: string
  sessionId: string
  name: string
  curl: string | null
  method: string | null
  url: string | null
  headers: Record<string, string>
  body: string | null
  createdAt: number
  updatedAt: number
}

export interface SaveRequestBody {
  name?: string
  curl?: string
  method?: string
  url?: string
  headers?: Record<string, string>
  body?: string
}

export interface CaptureStatusView {
  active: boolean
  capturedCount: number
  directory: string
}
