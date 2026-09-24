/** 为 DeepSeek 官方档案选择 Claude Code 兼容入口。 */
export function claudeGatewayBaseUrl(baseUrl: string | undefined): string | undefined {
  if (!baseUrl) return baseUrl
  try {
    const url = new URL(baseUrl)
    if (url.hostname.toLowerCase() !== 'api.deepseek.com') return baseUrl
    url.protocol = 'https:'
    url.username = ''
    url.password = ''
    url.port = ''
    url.pathname = '/anthropic'
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/$/, '')
  } catch {
    return baseUrl
  }
}

export function isOfficialDeepSeekGateway(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false
  try { return new URL(baseUrl).hostname.toLowerCase() === 'api.deepseek.com' } catch { return false }
}

/** 隔离 Claude 网关会话的凭据与默认模型，避免继承其他账号配置。 */
export function claudeGatewayEnvironment(
  baseUrl: string | undefined, key: string, model: string | undefined, inherited: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...inherited,
    ANTHROPIC_BASE_URL: claudeGatewayBaseUrl(baseUrl),
    ANTHROPIC_AUTH_TOKEN: key,
  }
  for (const name of ['ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL',
    'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL']) delete env[name]
  if (model) {
    env.ANTHROPIC_MODEL = model
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = model
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = model
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = model
    env.CLAUDE_CODE_SUBAGENT_MODEL = model
  }
  if (isOfficialDeepSeekGateway(baseUrl)) {
    delete env.ANTHROPIC_API_KEY
  } else {
    env.ANTHROPIC_API_KEY = key
  }
  return env
}

/** 排除 Claude SDK 的合成占位模型，它不是上游 API 实际返回值。 */
export function verifiableResponseModel(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() && value !== '<synthetic>' ? value : undefined
}
