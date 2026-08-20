import type { AssistantContextProvider } from './types'

const DEFAULT_PROVIDER_TIMEOUT_MS = 1_500

export async function collectProviderContext(
  providers: AssistantContextProvider[],
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<{ contributions: Record<string, unknown>; unavailableProviders: string[] }> {
  const results = await Promise.all(providers.map(provider => collectOne(provider, timeoutMs, signal)))
  const contributions: Record<string, unknown> = {}
  const unavailableProviders: string[] = []

  for (const result of results) {
    if (!result.contribution) {
      unavailableProviders.push(result.providerId)
      continue
    }
    contributions[result.contribution.key] = result.contribution.value
  }

  return { contributions, unavailableProviders }
}

async function collectOne(provider: AssistantContextProvider, timeoutMs: number, outerSignal?: AbortSignal) {
  const controller = new AbortController()
  const abort = () => controller.abort(outerSignal?.reason ?? 'submission-interrupted')
  if (outerSignal?.aborted) abort()
  else outerSignal?.addEventListener('abort', abort, { once: true })
  const timer = window.setTimeout(() => controller.abort('provider-timeout'), Math.max(1, timeoutMs))
  try {
    const contribution = await Promise.race([
      provider.collect(controller.signal),
      abortResult(controller.signal),
    ])
    return { providerId: provider.id, contribution }
  } catch {
    return { providerId: provider.id, contribution: undefined }
  } finally {
    window.clearTimeout(timer)
    outerSignal?.removeEventListener('abort', abort)
  }
}

function abortResult(signal: AbortSignal): Promise<undefined> {
  return new Promise(resolve => signal.addEventListener('abort', () => resolve(undefined), { once: true }))
}
