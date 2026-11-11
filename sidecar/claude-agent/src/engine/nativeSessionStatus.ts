/** Native observations describe progress only; TurnLifecycle still owns admission and cleanup. */
export interface NativeSessionStatus {
  source: 'codex' | 'claude'
  state: 'running' | 'idle' | 'awaitingApproval' | 'awaitingInput' | 'requiresAction' | 'retrying' | 'unavailable' | 'failed'
  attempt?: number
  maxAttempts?: number
  retryDelayMs?: number
}

export interface TurnFailure {
  category: 'quota' | 'context' | 'authentication' | 'network' | 'request' | 'refusal' | 'limit' | 'incomplete' | 'unknown'
  code?: string
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

/** Unknown codes remain unknown; error prose is never used to guess authentication or safety policy. */
export function classifyTurnFailure(code: unknown, httpStatus?: unknown): TurnFailure {
  const key = typeof code === 'string' ? code : Object.keys(record(code) ?? {})[0]
  const groups: Record<Exclude<TurnFailure['category'], 'unknown'>, readonly string[]> = {
    quota: ['usageLimitExceeded', 'rateLimitExceeded', 'sessionBudgetExceeded', 'error_max_budget_usd', 'budget_exhausted', 'blocking_limit', 'billing_error', 'rate_limit', 'rapid_refill_breaker'],
    context: ['contextWindowExceeded', 'prompt_too_long'],
    authentication: ['unauthorized', 'authentication_failed', 'oauth_org_not_allowed', 'cloud_credential_error', 'gateway_signin_required', 'gateway_access_denied', 'account_on_hold', 'verification_required'],
    network: ['serverOverloaded', 'internalServerError', 'httpConnectionFailed', 'responseStreamConnectionFailed', 'responseStreamDisconnected', 'responseTooManyFailedAttempts', 'api_error', 'overloaded', 'server_error', 'aborted_streaming'],
    request: ['badRequest', 'sandboxError', 'error_during_execution', 'invalid_request', 'model_not_found', 'malformed_tool_use_exhausted', 'image_error', 'model_error', 'aborted_tools', 'turn_setup_failed', 'tool_deferred_unavailable'],
    refusal: ['cyberPolicy', 'misalignmentPolicyViolation', 'refusal', 'model_refusal_no_fallback'],
    limit: ['error_max_turns', 'max_turns', 'max_turn_requests', 'max_output_tokens', 'tooManyDenials', 'error_max_structured_output_retries', 'structured_output_retry_exhausted'],
    incomplete: ['incomplete', 'queue_check_unconfirmed'],
  }
  const status = httpStatus ?? (key ? record(record(code)?.[key])?.httpStatusCode : undefined)
  // An upstream HTTP code is useful when the engine reports a generic connection failure.
  const category = status === 401 ? 'authentication' : status === 429 ? 'quota'
    : Object.entries(groups).find(([, codes]) => key && codes.includes(key))?.[0] as TurnFailure['category'] | undefined
  return { category: category ?? 'unknown', ...(key && /^[A-Za-z][A-Za-z0-9_]{0,79}$/.test(key) ? { code: key } : {}) }
}

export function codexSessionStatus(status: unknown): NativeSessionStatus | undefined {
  const value = record(status)
  const flags = Array.isArray(value?.activeFlags) ? value.activeFlags : []
  switch (value?.type) {
    case 'active': return { source: 'codex', state: flags.includes('waitingOnUserInput') ? 'awaitingInput'
      : flags.includes('waitingOnApproval') ? 'awaitingApproval' : 'running' }
    case 'idle': return { source: 'codex', state: 'idle' }
    case 'notLoaded': return { source: 'codex', state: 'unavailable' }
    case 'systemError': return { source: 'codex', state: 'failed' }
    default: return undefined
  }
}

export function claudeSessionStatus(message: Record<string, unknown>): NativeSessionStatus | undefined {
  if (message.subtype === 'session_state_changed') {
    if (message.state === 'running' || message.state === 'idle') return { source: 'claude', state: message.state }
    if (message.state === 'requires_action') return { source: 'claude', state: 'requiresAction' }
  }
  if (message.subtype === 'api_retry') return { source: 'claude', state: 'retrying',
    ...retryCounts(message.attempt, message.max_retries, message.retry_delay_ms) }
  return undefined
}

export function retryCounts(attempt: unknown, maxAttempts: unknown, retryDelayMs?: unknown): Pick<NativeSessionStatus, 'attempt' | 'maxAttempts' | 'retryDelayMs'> {
  const count = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
  return { ...(count(attempt) ? { attempt } : {}), ...(count(maxAttempts) ? { maxAttempts } : {}),
    ...(count(retryDelayMs) ? { retryDelayMs } : {}) }
}

export function claudeTurnFailure(message: Record<string, unknown>, assistantFailure?: TurnFailure): TurnFailure | undefined {
  const subtype = String(message.subtype ?? '')
  const reason = message.terminal_reason
  if (subtype === 'success' && message.is_error !== true && (!reason || reason === 'completed')) return undefined
  if (subtype === 'success' && reason === 'background_requested') return undefined
  // Generic result envelopes must not hide a more precise native assistant error.
  if (assistantFailure && assistantFailure.category !== 'unknown'
    && (!reason || reason === 'api_error')) return assistantFailure
  const specific = reason || message.api_error_status != null
    ? classifyTurnFailure(reason ?? 'api_error', message.api_error_status) : undefined
  return specific?.category !== 'unknown' && specific ? specific
    : assistantFailure ?? specific ?? classifyTurnFailure(subtype)
}
