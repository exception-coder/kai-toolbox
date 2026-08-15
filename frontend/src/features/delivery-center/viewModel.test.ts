import { describe, expect, it } from 'vitest'
import { requirementProgress } from './viewModel'
import type { DeliveryRequirement } from './types'

describe('requirementProgress', () => {
  it('uses server-projected authoritative progress variants', () => {
    const requirement = {
      overallProgress: 68,
      overallProgressVariants: {
        includingTests: 68,
        excludingTests: 74,
      },
    } as DeliveryRequirement

    expect(requirementProgress(requirement)).toBe(68)
    expect(requirementProgress(requirement, false)).toBe(74)
  })
})
