export function isOfficialDeepSeekBaseUrl(baseUrl: string): boolean {
  try { return new URL(baseUrl).hostname.toLowerCase() === 'api.deepseek.com' } catch { return false }
}

export function isProviderAuthenticationError(error: string | null): boolean {
  return Boolean(error && /API Key 未通过认证|HTTP 401|Invalid token/i.test(error))
}
