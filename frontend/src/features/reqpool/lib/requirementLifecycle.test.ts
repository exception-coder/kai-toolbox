import { describe, expect, it } from 'vitest'
import type { DeliveryRequirement } from '@/features/delivery-center/public-api'
import type { PrdSessionView } from '@/features/prd-clarify/public-api'
import type { ReqItemView } from '../types'
import { requirementLifecycle } from './requirementLifecycle'

const item = (status: ReqItemView['status']) => ({ status } as ReqItemView)
const session = (progressWorkStatus: PrdSessionView['progressWorkStatus']) => ({ progressWorkStatus } as PrdSessionView)
const requirement = (score: number) => ({ stages: { code: { score } } } as DeliveryRequirement)

describe('requirementLifecycle', () => {
  it('projects persisted workflow states into user-facing lifecycle states', () => {
    expect(requirementLifecycle(item('DRAFT'))).toBe('DRAFT')
    expect(requirementLifecycle(item('PRD_READY'))).toBe('READY')
    expect(requirementLifecycle(item('IN_DEV'))).toBe('EXECUTING')
    expect(requirementLifecycle(item('DONE'))).toBe('DONE')
    expect(requirementLifecycle(item('CANCELLED'))).toBe('ARCHIVED')
  })

  it('moves a high-confidence completed analysis to human confirmation', () => {
    expect(requirementLifecycle(item('IN_DEV'), requirement(94), session('COMPLETED'))).toBe('REVIEW')
    expect(requirementLifecycle(item('IN_DEV'), requirement(68), session('COMPLETED'))).toBe('EXECUTING')
  })

  it('treats an active progress agent as execution before status persistence catches up', () => {
    expect(requirementLifecycle(item('PRD_READY'), undefined, session('RUNNING'))).toBe('EXECUTING')
  })
})
