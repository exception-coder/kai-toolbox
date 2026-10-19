import { webcrypto } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { requestConsultContinuation } from './consultContinuation'
import { continueConsult } from './api'
vi.mock('./api', () => ({ continueConsult: vi.fn(async () => ({})) }))
afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); vi.clearAllMocks() })

it('retries with a stable per-user, source and payload ID without storing the question', async () => {
  vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) })
  const request = { systemName: '', systemSourcePath: '', moduleNames: [], questionTitle: '261019-核查', question: '检查订单库存', role: 'BIZ', engine: 'codex' as const }
  vi.mocked(continueConsult).mockRejectedValueOnce(new Error('connection lost'))
  await expect(requestConsultContinuation(1, 'source', request)).rejects.toThrow('connection lost')
  const first = vi.mocked(continueConsult).mock.calls[0][1]
  await requestConsultContinuation(1, 'source', request)
  expect(vi.mocked(continueConsult).mock.calls[1][1]).toBe(first)
  await requestConsultContinuation(1, 'source', request)
  expect(vi.mocked(continueConsult).mock.calls[2][1]).not.toBe(first)
  await requestConsultContinuation(2, 'source', request)
  expect(vi.mocked(continueConsult).mock.calls[3][1]).not.toBe(first)
  expect(JSON.stringify(sessionStorage)).not.toContain(request.question)
})

it('does not reuse a lost request for a different attachment selection', async () => {
  vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) })
  const request = { systemName: '', systemSourcePath: '', moduleNames: [], questionTitle: '261019-附件', question: '分析附件', role: 'BIZ', engine: 'codex' as const }
  vi.mocked(continueConsult).mockRejectedValueOnce(new Error('lost'))
  await expect(requestConsultContinuation(9, 'another-source', request, 'file-a.xlsx:100')).rejects.toThrow()
  const first = vi.mocked(continueConsult).mock.calls[0][1]
  await requestConsultContinuation(9, 'another-source', request, 'file-b.xlsx:200')
  expect(vi.mocked(continueConsult).mock.calls[1][1]).not.toBe(first)
})
