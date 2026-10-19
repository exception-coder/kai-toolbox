import { Codex, type CodexOptions } from '@openai/codex-sdk'
import type { CodexTransportSelection } from '../codexTransportPolicy.js'

/** A per-turn client keeps a fallback's transport out of shared SDK client caches. */
export function createCodexSdkFallbackClient(options: CodexOptions, selection: CodexTransportSelection): Codex {
  return new Codex({ ...options,
    config: { ...selection.config as CodexOptions['config'], ...options.config,
      ...(selection.modelProvider ? { model_provider: selection.modelProvider } : {}) } })
}
