export type InvitationStatus = 'AVAILABLE' | 'CONSUMED' | 'EXPIRED' | 'REVOKED'
export type QuotationStatus = 'OPEN' | 'SUBMITTED' | 'CLOSED' | 'CANCELLED'
export type ErpSyncStatus = 'NOT_STARTED' | 'PENDING' | 'SYNCED' | 'FAILED'

export interface ScmBinding {
  scmUserId: string
  username: string
  displayName: string
  supplierId: string
  supplierName: string
}

export interface WechatSession {
  authenticated: boolean
  bound: boolean
  authorizeUrl: string | null
  binding: ScmBinding | null
}

export interface ScmBindingRequest {
  username: string
  password: string
  returnTo: string
}

export interface ScmBindingResult {
  binding: ScmBinding
  returnTo: string
}

export interface RegistrationDefaults {
  name: string
  mobile: string
  companyName: string
  position: string
}

export interface RegistrationInvitation {
  invitationId: string
  status: InvitationStatus
  supplier: { displayName: string }
  contact: { displayName: string; maskedMobile: string | null }
  defaults: RegistrationDefaults
  verificationRequired: boolean
  expiresAt: string
  returnPath: string | null
}

export interface VerificationCodeRequest {
  invitationTicket: string
  scene: 'REGISTRATION'
}

export interface VerificationCodeReceipt {
  cooldownSeconds: number
  expiresInSeconds: number
  maskedMobile: string
}

export interface RegistrationRequest extends RegistrationDefaults {
  invitationTicket: string
  verificationCode: string
  acceptedTerms: boolean
  idempotencyKey: string
}

export interface RegistrationResult {
  portalUserId: string
  contactBindingStatus: 'ACTIVE'
  displayName: string
  returnPath: string | null
}

export interface QuotationLineDraft {
  itemId: string
  unitPrice: string
  taxRate: string
  deliveryDays: number | null
  moq: string
  remark: string
}

export interface QuotationItem {
  itemId: string
  materialCode: string
  materialName: string
  specification: string
  quantity: string
  unit: string
  draft: QuotationLineDraft
}

export interface QuotationAccess {
  quotationId: string
  requestNo: string
  title: string
  buyerName: string
  supplierName: string
  contactName: string
  status: QuotationStatus
  editable: boolean
  deadline: string
  currency: 'CNY'
  taxIncluded: boolean
  items: QuotationItem[]
  overallRemark: string
  draftVersion: number
  submittedAt: string | null
  erpSyncStatus: ErpSyncStatus
}

export interface QuotationDraftInput {
  items: QuotationLineDraft[]
  overallRemark: string
  idempotencyKey: string
  draftVersion: number
}

export interface DraftReceipt {
  draftVersion: number
  savedAt: string
}

export interface SubmissionReceipt {
  submissionId: string
  submittedAt: string
  requestNo: string
  erpSyncStatus: ErpSyncStatus
}

export interface SupplierQuoteGateway {
  getWechatSession(returnTo: string, signal?: AbortSignal): Promise<WechatSession>
  bindScmAccount(request: ScmBindingRequest): Promise<ScmBindingResult>
  getRegistrationInvitation(ticket: string, signal?: AbortSignal): Promise<RegistrationInvitation>
  sendVerificationCode(request: VerificationCodeRequest): Promise<VerificationCodeReceipt>
  registerWithInvitation(request: RegistrationRequest): Promise<RegistrationResult>
  getQuotationAccess(ticket: string, signal?: AbortSignal): Promise<QuotationAccess>
  saveDraft(ticket: string, request: QuotationDraftInput): Promise<DraftReceipt>
  submitQuotation(ticket: string, request: QuotationDraftInput): Promise<SubmissionReceipt>
}

export class GatewayError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorCode: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'GatewayError'
  }
}

export function asGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new GatewayError(499, 'REQUEST_ABORTED', '请求已取消')
  }
  return new GatewayError(0, 'NETWORK_ERROR', error instanceof Error ? error.message : '网络连接失败，请稍后重试')
}

export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `h5-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
