import { z } from 'zod'

export const identifier = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/)
export const contextSchema = z.object({ project: z.string().min(1), changeId: identifier, branch: z.string().min(1).optional() })
export const refreshSchema = z.object({ project: z.string().min(1) })
export const resolveSchema = contextSchema.extend({
  requestId: z.string().min(1).max(200),
  sessionId: z.string().min(1).max(200).optional(),
  requirements: z.array(z.object({ externalId: identifier, text: z.string().trim().min(2).max(8000),
    atomic: z.literal(true), terms: z.array(z.string().min(1).max(100)).max(12).default([]) })).min(1).max(50),
  changedFiles: z.array(z.string().min(1).max(500)).max(100).default([]),
  semantic: z.boolean().default(true),
  timeoutMs: z.number().int().min(100).max(60000).default(4000),
})
export const decisionSchema = z.object({
  itemId: identifier,
  classification: z.enum(['ADDED', 'MODIFIED', 'REMOVED', 'NEW_CAPABILITY', 'NO_SPEC_CHANGE']),
  capabilityId: identifier.optional(), requirementId: identifier.optional(),
  reason: z.string().trim().min(10).max(4000),
  requirement: z.string().max(60000).optional(),
})
export const confirmSchema = contextSchema.extend({
  resolutionId: z.string().regex(/^sr_[a-f0-9]{32}$/),
  actor: z.string().trim().min(1).max(200),
  decisions: z.array(decisionSchema).min(1).max(50),
  implementationFiles: z.array(z.string().min(1).max(500)).max(1000).default([]),
})
export const checkSchema = contextSchema.extend({
  operation: z.enum(['BEFORE_IMPLEMENTATION', 'BEFORE_COMMIT']).default('BEFORE_IMPLEMENTATION'),
  files: z.array(z.string().max(500)).max(1000).default([]),
})
export type ResolveInput = z.infer<typeof resolveSchema>
export type Decision = z.infer<typeof decisionSchema>
export type Context = z.infer<typeof contextSchema>
export interface Unit {
  capabilityId: string; requirementId: string; title: string; content: string;
  specPath: string; line: number; scenarios: string[]; section: string; explicitId: boolean
}
export interface Candidate extends Unit { score: number; evidence: string[] }
export interface Resolution {
  schemaVersion: 1; resolutionId: string; project: string; branch: string; changeId: string;
  requestId: string; specRevision: string; createdAt: string;
  items: Array<{ itemId: string; text: string; candidates: Candidate[] }>;
  warnings: string[]; graph: { status: string; evidence: string[]; revision?: string; reasons?: string[] };
  changedFiles?: string[]; implementationFiles?: string[];
  semantic?: { status: string; engine?: string; model?: string; recommendations: unknown[]; drafts: Array<{ path: string; content: string }>; elapsedMs: number };
  decisions?: Decision[]; audit: Array<{ actor: string; source: 'AGENT'; at: string; decisions: Decision[] }>
}
export class ResolutionError extends Error {
  constructor(public code: string, message: string) { super(message) }
}
export function requireCondition(value: unknown, code: string, message: string): asserts value {
  if (!value) throw new ResolutionError(code, message)
}
