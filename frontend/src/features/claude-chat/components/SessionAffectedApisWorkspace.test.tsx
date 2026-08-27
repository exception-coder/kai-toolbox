import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SessionAffectedApisWorkspace } from './SessionAffectedApisWorkspace'
import type { SessionAffectedApi } from '../types'

const entry: SessionAffectedApi = {
  id: 'api-1',
  sessionId: 'session-1',
  httpMethod: 'PUT',
  apiPath: '/api/orders/{id}/confirm',
  changeType: 'MODIFIED',
  sourceFile: 'src/main/java/com/acme/OrderController.java',
  handlerName: 'OrderController#confirm',
  summary: '补充库存失败映射',
  verificationStatus: 'UNVERIFIED',
  verificationMethod: null,
  verificationCommand: null,
  verificationSummary: null,
  createdAt: 1,
  updatedAt: 2,
  verifiedAt: null,
}

describe('SessionAffectedApisWorkspace', () => {
  it('separates recorded changes from release verification', () => {
    render(<SessionAffectedApisWorkspace entries={[entry]} readiness={{
      total: 1,
      passed: 0,
      failed: 0,
      unverified: 1,
      notApplicable: 0,
      ready: false,
    }} />)

    expect(screen.getByText('/api/orders/{id}/confirm')).toBeInTheDocument()
    expect(screen.getByText('补充库存失败映射')).toBeInTheDocument()
    expect(screen.getByText('发布前仍需验证')).toBeInTheDocument()
    expect(screen.getByText('待验证 1')).toBeInTheDocument()
  })

  it('shows ready only when deterministic evidence is complete', () => {
    render(<SessionAffectedApisWorkspace entries={[{ ...entry, verificationStatus: 'PASSED' }]} readiness={{
      total: 1,
      passed: 1,
      failed: 0,
      unverified: 0,
      notApplicable: 0,
      ready: true,
    }} />)

    expect(screen.getByText('发布检查已就绪')).toBeInTheDocument()
  })
})
