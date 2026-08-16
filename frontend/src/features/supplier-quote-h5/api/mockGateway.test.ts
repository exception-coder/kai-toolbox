import { describe, expect, it } from 'vitest'
import { createMockSupplierQuoteGateway } from './mockGateway'

describe('supplier quote mock gateway', () => {
  it('loads a dedicated registration invitation', async () => {
    const gateway = createMockSupplierQuoteGateway()
    const invitation = await gateway.getRegistrationInvitation('demo-invite')
    expect(invitation.status).toBe('AVAILABLE')
    expect(invitation.contact.maskedMobile).toBe('138****1234')
  })

  it('rejects an expired invitation with a stable error code', async () => {
    const gateway = createMockSupplierQuoteGateway()
    await expect(gateway.getRegistrationInvitation('expired-invite')).rejects.toMatchObject({
      status: 410,
      errorCode: 'INVITATION_EXPIRED',
    })
  })

  it('requires registration for an unbound quote ticket', async () => {
    const gateway = createMockSupplierQuoteGateway()
    await expect(gateway.getQuotationAccess('unbound-quote')).rejects.toMatchObject({
      errorCode: 'REGISTRATION_REQUIRED',
      details: { invitationTicket: 'demo-invite', returnPath: '/q/unbound-quote' },
    })
  })

  it('persists a draft and makes a submitted quotation read-only', async () => {
    const gateway = createMockSupplierQuoteGateway()
    const access = await gateway.getQuotationAccess('demo-quote')
    const request = {
      items: access.items.map(item => item.draft),
      overallRemark: '价格有效期七天',
      idempotencyKey: 'idem-1',
      draftVersion: access.draftVersion,
    }
    const saved = await gateway.saveDraft('demo-quote', request)
    expect(saved.draftVersion).toBe(2)
    await gateway.submitQuotation('demo-quote', { ...request, idempotencyKey: 'idem-2', draftVersion: saved.draftVersion })
    const submitted = await gateway.getQuotationAccess('demo-quote')
    expect(submitted).toMatchObject({ status: 'SUBMITTED', editable: false, overallRemark: '价格有效期七天' })
  })
})
