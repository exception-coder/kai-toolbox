import { http } from '@/lib/api'
export interface SuggestionDraft { title: string; problem: string; expected: string; acceptance: string }
export interface Suggestion extends SuggestionDraft { id: string; original: string; createdAt: number }
export interface SuggestionPage { items: Suggestion[]; total: number }
export function listSuggestions(offset = 0) {
  return http<SuggestionPage>(`/fore-consult/suggestions?offset=${offset}`)
}
export function normalizeSuggestion(original: string) {
  return http<SuggestionDraft>('/fore-consult/suggestions/normalize', { method: 'POST', body: JSON.stringify({ original }) })
}
export function submitSuggestion(requestId: string, original: string, draft: SuggestionDraft) {
  return http<Suggestion>('/fore-consult/suggestions', { method: 'POST', body: JSON.stringify({ requestId, original, draft }) })
}
