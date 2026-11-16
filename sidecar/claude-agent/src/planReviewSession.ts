import { Session } from './sessionManager.js'
import { HANDOFF_ENGINES } from './engineHandoff.js'
import { isEngineId } from './engine/engineContract.js'

export function createPlanReviewSession(request: {
  requestId: string; engine: string; cwd: string; codexHome?: string; apiBaseUrl?: string; authToken?: string
}, emit: (event: Record<string, unknown>) => void): Session {
  if (!isEngineId(request.engine) || !HANDOFF_ENGINES.has(request.engine)) throw new Error('Unsupported review engine')
  const candidate = new Session(`plan-review:${request.requestId}`, request.cwd, emit)
  candidate.engine = request.engine
  candidate.codexHome = request.codexHome
  candidate.apiBaseUrl = request.apiBaseUrl
  candidate.authToken = request.authToken
  candidate.toolPolicy = request.engine === 'codex' ? 'review-only' : 'disabled'
  candidate.strictNativeResume = true
  candidate.forgeSqlRegistration = false
  return candidate
}
