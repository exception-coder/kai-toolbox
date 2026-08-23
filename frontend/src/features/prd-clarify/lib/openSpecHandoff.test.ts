import { describe, expect, it } from 'vitest'
import type { PrdSessionView } from '../types'
import { buildOpenSpecLinkSyncPrompt, OPEN_SPEC_PRE_CODING_GATE } from './openSpecHandoff'

describe('OpenSpec development handoff', () => {
  it('blocks implementation until OpenSpec validation succeeds', () => {
    expect(OPEN_SPEC_PRE_CODING_GATE).toContain('openspec context --json')
    expect(OPEN_SPEC_PRE_CODING_GATE).toContain('openspec validate <change-id>')
    expect(OPEN_SPEC_PRE_CODING_GATE).toContain('不得进入编码阶段')
  })

  it('includes every available specification artifact for a manual link', () => {
    const prompt = buildOpenSpecLinkSyncPrompt({
      id: 'prd-1',
      title: '探索式规格',
      mdPath: 'C:/spec/prd.md',
      devDocPath: 'C:/spec/tdd.md',
      initialSpecPath: 'C:/spec/initial.md',
    } as PrdSessionView)

    expect(prompt).toContain('PRD_SESSION_ID: prd-1')
    expect(prompt).toContain('C:/spec/prd.md')
    expect(prompt).toContain('C:/spec/tdd.md')
    expect(prompt).toContain('C:/spec/initial.md')
    expect(prompt).toContain('只负责把最新规格同步进 OpenSpec')
  })
})
