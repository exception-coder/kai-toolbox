import { createOpencode } from '@opencode-ai/sdk'

export const FORGE_OPENCODE_PROVIDER = 'forge-session'

export interface OpencodeGatewaySettings {
  apiBaseUrl?: string
  authToken?: string
  model?: string
  signal: AbortSignal
}

/** Inject only into the owned child process; never update OpenCode's persisted configuration. */
export function opencodeGatewayOptions(settings: OpencodeGatewaySettings) {
  const baseURL = settings.apiBaseUrl?.trim()
  const model = settings.model?.trim()
  if (!baseURL || !settings.authToken?.trim() || !model) {
    throw new Error('OpenCode 第三方会话需要服务地址、Key 和明确的模型；请在会话配置中补齐。')
  }
  const url = new URL(baseURL)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('OpenCode 服务地址必须是无内嵌凭据的 HTTP(S) URL')
  }
  return {
    hostname: '127.0.0.1', port: 0, signal: settings.signal,
    config: {
      model: `${FORGE_OPENCODE_PROVIDER}/${model}`,
      small_model: `${FORGE_OPENCODE_PROVIDER}/${model}`,
      enabled_providers: [FORGE_OPENCODE_PROVIDER],
      provider: {
        [FORGE_OPENCODE_PROVIDER]: {
          npm: '@ai-sdk/openai-compatible', name: 'Forge 会话服务商',
          options: { baseURL, apiKey: settings.authToken },
          models: { [model]: { name: model } },
        },
      },
    },
  } satisfies NonNullable<Parameters<typeof createOpencode>[0]>
}
