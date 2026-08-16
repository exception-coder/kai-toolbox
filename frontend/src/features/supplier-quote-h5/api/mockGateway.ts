import {
  GatewayError,
  type DraftReceipt,
  type QuotationAccess,
  type QuotationDraftInput,
  type RegistrationInvitation,
  type RegistrationRequest,
  type RegistrationResult,
  type SubmissionReceipt,
  type SupplierQuoteGateway,
  type VerificationCodeReceipt,
} from './contract'

const MOCK_DELAY_MS = 320

export function createMockSupplierQuoteGateway(): SupplierQuoteGateway {
  const drafts = new Map<string, QuotationDraftInput>()
  const submissions = new Map<string, SubmissionReceipt>()

  return {
    async getWechatSession() {
      await delay()
      return {
        authenticated: true,
        bound: true,
        authorizeUrl: null,
        binding: {
          scmUserId: 'scm-demo-001', username: 'supplier-demo', displayName: '王经理',
          supplierId: 'supplier-demo-001', supplierName: '广州睿程服饰有限公司',
        },
      }
    },
    async bindScmAccount(request) {
      await delay()
      if (request.username !== 'supplier-demo' || request.password !== '123456') {
        throw new GatewayError(401, 'SCM_CREDENTIALS_INVALID', 'SCM 账号或密码不正确')
      }
      return {
        binding: {
          scmUserId: 'scm-demo-001', username: request.username, displayName: '王经理',
          supplierId: 'supplier-demo-001', supplierName: '广州睿程服饰有限公司',
        },
        returnTo: request.returnTo,
      }
    },
    async getRegistrationInvitation(ticket, signal) {
      await delay(signal)
      assertInvitationAvailable(ticket)
      return invitationFixture(ticket)
    },
    async sendVerificationCode() {
      await delay()
      return { cooldownSeconds: 60, expiresInSeconds: 300, maskedMobile: '138****1234' }
    },
    async registerWithInvitation(request) {
      await delay()
      assertInvitationAvailable(request.invitationTicket)
      if (request.verificationCode !== '123456') {
        throw new GatewayError(400, 'VERIFICATION_CODE_INVALID', '验证码不正确，演示验证码为 123456')
      }
      if (!request.acceptedTerms) throw new GatewayError(400, 'TERMS_REQUIRED', '请先同意门户服务协议')
      return {
        portalUserId: 'pu_demo_01',
        contactBindingStatus: 'ACTIVE',
        displayName: request.name,
        returnPath: '/q/demo-quote',
      }
    },
    async getQuotationAccess(ticket, signal) {
      await delay(signal)
      if (ticket.includes('invalid')) throw new GatewayError(404, 'QUOTE_TICKET_NOT_FOUND', '报价链接不存在')
      if (ticket.includes('forbidden')) throw new GatewayError(403, 'QUOTE_TICKET_FORBIDDEN', '该报价链接不属于当前微信账号')
      if (ticket.includes('unbound')) {
        throw new GatewayError(401, 'REGISTRATION_REQUIRED', '完成邀请注册后即可报价', {
          invitationTicket: 'demo-invite',
          returnPath: `/q/${ticket}`,
        })
      }
      const quotation = quotationFixture(ticket, drafts.get(ticket))
      const submitted = submissions.get(ticket)
      return submitted
        ? { ...quotation, status: 'SUBMITTED', editable: false, submittedAt: submitted.submittedAt, erpSyncStatus: submitted.erpSyncStatus }
        : quotation
    },
    async saveDraft(ticket, request) {
      await delay()
      assertQuotationWritable(ticket, submissions)
      drafts.set(ticket, structuredClone(request))
      return { draftVersion: request.draftVersion + 1, savedAt: new Date().toISOString() }
    },
    async submitQuotation(ticket, request) {
      await delay()
      assertQuotationWritable(ticket, submissions)
      drafts.set(ticket, structuredClone(request))
      const receipt: SubmissionReceipt = {
        submissionId: `sub_${Date.now()}`,
        submittedAt: new Date().toISOString(),
        requestNo: 'XJ20260815018',
        erpSyncStatus: 'PENDING',
      }
      submissions.set(ticket, receipt)
      return receipt
    },
  }
}

function invitationFixture(ticket: string): RegistrationInvitation {
  return {
    invitationId: `inv_${ticket}`,
    status: 'AVAILABLE',
    supplier: { displayName: '广州睿程服饰有限公司' },
    contact: { displayName: '王经理', maskedMobile: '138****1234' },
    defaults: {
      name: '王明',
      mobile: '13800001234',
      companyName: '广州睿程服饰有限公司',
      position: '业务经理',
    },
    verificationRequired: true,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    returnPath: '/q/demo-quote',
  }
}

function quotationFixture(ticket: string, draft?: QuotationDraftInput): QuotationAccess {
  const state = ticket.includes('closed') ? 'CLOSED' : ticket.includes('submitted') ? 'SUBMITTED' : 'OPEN'
  const defaults = [
    { itemId: 'item_01', unitPrice: '18.6000', taxRate: '13', deliveryDays: 12, moq: '1000', remark: '含税含运' },
    { itemId: 'item_02', unitPrice: '', taxRate: '13', deliveryDays: 15, moq: '800', remark: '' },
  ]
  const lineDrafts = draft?.items ?? defaults
  return {
    quotationId: 'qr_20260815018',
    requestNo: 'XJ20260815018',
    title: '秋冬针织面料询价',
    buyerName: '凯纺供应链',
    supplierName: '广州睿程服饰有限公司',
    contactName: '王经理',
    status: state,
    editable: state === 'OPEN',
    deadline: new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString(),
    currency: 'CNY',
    taxIncluded: true,
    overallRemark: draft?.overallRemark ?? '',
    draftVersion: draft?.draftVersion ? draft.draftVersion + 1 : 1,
    items: [
      {
        itemId: 'item_01',
        materialCode: 'MAT-4012',
        materialName: '40S锦氨罗马布',
        specification: '320g/m² · 门幅150cm · 黑色',
        quantity: '5000',
        unit: '米',
        draft: lineDrafts[0],
      },
      {
        itemId: 'item_02',
        materialCode: 'MAT-2871',
        materialName: '32S精梳棉双面布',
        specification: '280g/m² · 门幅165cm · 藏青',
        quantity: '3200',
        unit: '公斤',
        draft: lineDrafts[1],
      },
    ],
    submittedAt: state === 'SUBMITTED' ? new Date().toISOString() : null,
    erpSyncStatus: state === 'SUBMITTED' ? 'SYNCED' : 'NOT_STARTED',
  }
}

function assertInvitationAvailable(ticket: string) {
  if (ticket.includes('expired')) throw new GatewayError(410, 'INVITATION_EXPIRED', '邀请已过期，请联系业务员重新发送')
  if (ticket.includes('used')) throw new GatewayError(409, 'INVITATION_CONSUMED', '邀请已被其他微信账号使用')
  if (ticket.includes('invalid')) throw new GatewayError(404, 'INVITATION_NOT_FOUND', '邀请链接不存在或已被撤销')
}

function assertQuotationWritable(ticket: string, submissions: Map<string, SubmissionReceipt>) {
  if (ticket.includes('closed')) throw new GatewayError(410, 'QUOTATION_CLOSED', '本次询价已截止')
  if (ticket.includes('submitted') || submissions.has(ticket)) {
    throw new GatewayError(409, 'QUOTATION_ALREADY_SUBMITTED', '该报价已经提交，请勿重复操作')
  }
}

function delay(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, MOCK_DELAY_MS)
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}
