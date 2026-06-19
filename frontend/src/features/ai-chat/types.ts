export interface ModelInfo {
  id: string
  label: string
  multimodal: boolean
  /** 是否支持自定义温度；推理模型为 false（不下发 temperature）。 */
  supportsTemperature: boolean
  /** 能力标签（取自网关 /api/pricing，如 推理/工具/文件/多模态/200K）；无则空。 */
  tags: string[]
  /** 模型介绍（取自网关 pricing description）；无则 null。 */
  description?: string | null
  /** 价格倍率（pricing model_ratio），作能力/成本代理；无则 0。 */
  priceRatio?: number
}

export interface RolePreset {
  id: string
  label: string
  systemPrompt: string
}

export interface ModelsView {
  models: ModelInfo[]
  presets: RolePreset[]
  source: 'remote' | 'fallback'
}

/** 当前 key 用量（取自网关 /api/usage/token）。currency 为货币符号（中国服务商为 ¥）。 */
export interface UsageInfo {
  available: boolean
  tokenName: string | null
  unlimited: boolean | null
  expiresAt: number | null
  currency: string | null
  usedAmount: number | null
  grantedAmount: number | null
  remainingAmount: number | null
  error: string | null
}

export interface ConversationView {
  id: string
  title: string
  model: string
  systemPrompt: string | null
  temperature: number | null
  maxTokens: number | null
  createdAt: number
  updatedAt: number
}

export interface AttachmentView {
  id: string
  name: string
  mime: string
  url: string
}

export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM'
export type MessageStatus = 'DONE' | 'INTERRUPTED' | 'ERROR'

/** 助手消息的本轮指标；用户消息或网关未返回时为 null/缺省。 */
export interface MessageMetrics {
  latencyMs?: number | null
  promptTokens?: number | null
  completionTokens?: number | null
  totalTokens?: number | null
  cachedTokens?: number | null
}

export interface MessageView extends MessageMetrics {
  id: string
  conversationId: string
  role: MessageRole
  content: string
  model: string | null
  attachments: AttachmentView[]
  status: MessageStatus
  createdAt: number
}

export interface MessagePage {
  messages: MessageView[]
  hasMore: boolean
}

export interface CreateConversationBody {
  title?: string
  model: string
  systemPrompt?: string
  temperature?: number | null
  maxTokens?: number | null
}

export interface UpdateConversationBody {
  title?: string
  model?: string
  systemPrompt?: string
  temperature?: number | null
  maxTokens?: number | null
}

export interface SendMessageBody {
  conversationId: string
  content: string
  attachmentIds?: string[]
  model?: string
  temperature?: number | null
  maxTokens?: number | null
}

/** 调试快照：后端真实请求 + 上游返回关键元数据，用于排障/核验。 */
export interface DebugMessage {
  role: string
  text: string
  images: number
}

export interface CompletionDebug {
  requestedAt: number
  baseUrl: string
  model: string
  temperatureSent: number | null
  maxTokens: number | null
  messages: DebugMessage[]
  status: string
  responseModel: string | null
  finishReason: string | null
  latencyMs: number | null
  promptTokens: number | null
  completionTokens: number | null
  totalTokens: number | null
  cachedTokens: number | null
  responseChars: number | null
  error: string | null
}

/** done 事件 payload；指标字段网关未提供时缺省。 */
export interface DonePayload extends MessageMetrics {
  messageId: string
  status: MessageStatus
  content: string
  debug?: CompletionDebug
}
