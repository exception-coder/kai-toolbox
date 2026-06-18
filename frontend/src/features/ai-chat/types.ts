export interface ModelInfo {
  id: string
  label: string
  multimodal: boolean
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

export interface MessageView {
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

/** done 事件 payload。 */
export interface DonePayload {
  messageId: string
  status: MessageStatus
  content: string
}
