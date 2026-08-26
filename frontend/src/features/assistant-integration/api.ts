import { http } from '@/lib/api'

export interface AssistantProjectBinding {
  projectKey: string
  displayName: string
  projectPath: string
  source: string
  sourceAvailable: boolean
  knowledgeAvailable: boolean
  explicit: boolean
  message: string
}

export interface AssistantIntegrationStatus {
  externalLoginEnabled: boolean
  externalLoginAllowedOrigins: string[]
  consultAllowedOriginPatterns: string[]
  externalLoginConfigured: boolean
  websocketOriginsRestricted: boolean
  loaderPath: string
  externalLoginPath: string
  consultWebSocketPath: string
  projectBindingsPath: string
}

export function listAssistantProjectBindings(): Promise<AssistantProjectBinding[]> {
  return http('/claude-chat/project-route-bindings')
}

export function getAssistantIntegrationStatus(): Promise<AssistantIntegrationStatus> {
  return http('/claude-chat/assistant-integration')
}
