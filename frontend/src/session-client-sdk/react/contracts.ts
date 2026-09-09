import type { PublicSession, SessionClient } from '../types'

export interface CollaborationContext {
  systemName: string
  moduleName: string
}

export interface RequirementDraft {
  title: string
  kind: '需求' | 'BUG' | '优化'
  summary: string
  current: string
  expected: string
  scope: string
  acceptance: string[]
  evidence: string[]
  questions: string[]
}

/** Host-owned authenticated requests. Keep this object stable across renders. */
export interface CollaborationAdapter {
  readSession(): Promise<PublicSession>
  pair(invitation: string): Promise<PublicSession>
  createClient(identity: string, session: PublicSession, reset: boolean): SessionClient
}

export interface CollaborationWorkbenchProps {
  identity: string
  adapter: CollaborationAdapter
  context: CollaborationContext
}
