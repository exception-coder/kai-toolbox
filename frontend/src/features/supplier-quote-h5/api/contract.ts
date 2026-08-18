export type InvitationStatus = "AVAILABLE" | "CONSUMED" | "EXPIRED" | "REVOKED";
export type QuotationStatus = "OPEN" | "SUBMITTED" | "CLOSED" | "CANCELLED";
export type ErpSyncStatus = "NOT_STARTED" | "PENDING" | "SYNCED" | "FAILED";

export interface BusinessAccountBinding {
  accountId: string;
  username: string;
  displayName: string;
  supplierId: string;
  supplierName: string;
  sourceSystem: string;
}

export interface WechatSession {
  authenticated: boolean;
  bound: boolean;
  authorizeUrl: string | null;
  binding: BusinessAccountBinding | null;
}

export interface AccountBindingRequest {
  username: string;
  password: string;
  returnTo: string;
}

export interface AccountBindingResult {
  binding: BusinessAccountBinding;
  returnTo: string;
}

export interface RegistrationDefaults {
  name: string;
  mobile: string;
  companyName: string;
  position: string;
}

export interface RegistrationInvitation {
  invitationId: string;
  status: InvitationStatus;
  supplier: { displayName: string };
  contact: { displayName: string; maskedMobile: string | null };
  defaults: RegistrationDefaults;
  verificationRequired: boolean;
  expiresAt: string;
  returnPath: string | null;
}

export interface VerificationCodeRequest {
  invitationTicket: string;
  scene: "REGISTRATION";
}

export interface VerificationCodeReceipt {
  cooldownSeconds: number;
  expiresInSeconds: number;
  maskedMobile: string;
}

export interface RegistrationRequest extends RegistrationDefaults {
  invitationTicket: string;
  verificationCode: string;
  acceptedTerms: boolean;
  idempotencyKey: string;
}

export interface RegistrationResult {
  portalUserId: string;
  contactBindingStatus: "ACTIVE";
  displayName: string;
  returnPath: string | null;
}

export interface QuotationLineDraft {
  itemId: string;
  unitPrice: string;
  taxRate: string;
  deliveryDays: number | null;
  moq: string;
  remark: string;
}

export interface QuotationItem {
  itemId: string;
  materialCode: string;
  materialName: string;
  specification: string;
  quantity: string;
  unit: string;
  draft: QuotationLineDraft;
}

export interface QuotationAccess {
  quotationId: string;
  requestNo: string;
  title: string;
  buyerName: string;
  supplierName: string;
  contactName: string;
  status: QuotationStatus;
  editable: boolean;
  deadline: string;
  currency: "CNY";
  taxIncluded: boolean;
  items: QuotationItem[];
  overallRemark: string;
  draftVersion: number;
  submittedAt: string | null;
  erpSyncStatus: ErpSyncStatus;
}

export interface QuotationDraftInput {
  items: QuotationLineDraft[];
  overallRemark: string;
  idempotencyKey: string;
  draftVersion: number;
}

export interface DraftReceipt {
  draftVersion: number;
  savedAt: string;
}

export interface SubmissionReceipt {
  submissionId: string;
  submittedAt: string;
  requestNo: string;
  erpSyncStatus: ErpSyncStatus;
}

export type MarketQuoteTab = "PENDING" | "ALL";
export type MarketQuoteStatus =
  | "PENDING_QUOTE"
  | "PENDING_AUDIT"
  | "APPROVED"
  | "REJECTED_VOID"
  | "REQUOTE";

export interface MarketQuoteItem {
  supcId: string;
  productId: string;
  productCode: string;
  productName: string;
  colorCode: string;
  colorName: string;
  colorGrade: string;
  certification: string | null;
  lastQuotedAt: string | null;
  lastPriceIncludeTax: string | null;
  lastPriceExcludeTax: string | null;
  status: MarketQuoteStatus;
  auditReason: string | null;
  haveTask: boolean;
  canQuote: boolean;
  canRevoke: boolean;
}

export interface MarketQuoteQuery {
  pageNo: number;
  pageSize: number;
  tab: MarketQuoteTab;
  productName: string;
  status: MarketQuoteStatus | "";
}

export interface MarketQuotePage {
  items: MarketQuoteItem[];
  total: number;
  pendingCount: number;
  pageNo: number;
  pageSize: number;
}

export interface MarketQuotePriceInput {
  supcId: string;
  priceIncludeTax: string;
  priceExcludeTax: string;
}

export interface MarketQuoteSubmissionResult {
  succeededIds: string[];
  failures: Array<{ supcId: string; message: string }>;
}

export interface YarnQualityStandards {
  twist: string;
  twistCv: string;
  strength: string;
  strengthCv: string;
  evennessCv: string;
  thinPlaces: string;
  thickPlaces: string;
  neps: string;
  hairinessIndex: string;
  foreignFiberCount: string;
}

export type SubscriptionGrantStatus = "AVAILABLE" | "SENDING" | "SENT" | "FAILED";

export interface SubscriptionGrant {
  id: number;
  status: SubscriptionGrantStatus;
  accountLabel: string;
  supplierName: string | null;
  createdAt: number;
  sentAt: number | null;
  resultCode: string | null;
  resultMessage: string | null;
  attemptCount: number;
  bound: boolean;
}

export interface SubscriptionGrantList {
  items: SubscriptionGrant[];
  availableCount: number;
}

export interface SubscriptionUser {
  userKey: number;
  accountLabel: string;
  supplierName: string | null;
  availableCount: number;
  totalCount: number;
  latestCreatedAt: number;
  latestResultCode: string | null;
  latestResultMessage: string | null;
  bound: boolean;
}

export interface SubscriptionUserList {
  items: SubscriptionUser[];
  availableCount: number;
  totalCount: number;
}

export interface SendSubscriptionInput {
  quoteTicket: string;
  title: string;
  content: string;
}

export interface SendSubscriptionUserInput {
  title: string;
  content: string;
}

export interface SendSubscriptionResult {
  grantId: number;
  status: "SENT" | "FAILED";
  resultCode: string;
  resultMessage: string;
}

export interface SupplierQuoteGateway {
  getWechatSession(
    returnTo: string,
    signal?: AbortSignal,
  ): Promise<WechatSession>;
  bindBusinessAccount(
    request: AccountBindingRequest,
  ): Promise<AccountBindingResult>;
  getRegistrationInvitation(
    ticket: string,
    signal?: AbortSignal,
  ): Promise<RegistrationInvitation>;
  sendVerificationCode(
    request: VerificationCodeRequest,
  ): Promise<VerificationCodeReceipt>;
  registerWithInvitation(
    request: RegistrationRequest,
  ): Promise<RegistrationResult>;
  getQuotationAccess(
    ticket: string,
    signal?: AbortSignal,
  ): Promise<QuotationAccess>;
  saveDraft(
    ticket: string,
    request: QuotationDraftInput,
  ): Promise<DraftReceipt>;
  submitQuotation(
    ticket: string,
    request: QuotationDraftInput,
  ): Promise<SubmissionReceipt>;
  getMarketQuotePage(
    query: MarketQuoteQuery,
    signal?: AbortSignal,
  ): Promise<MarketQuotePage>;
  submitMarketQuote(
    input: MarketQuotePriceInput,
  ): Promise<MarketQuoteSubmissionResult>;
  submitMarketQuotes(
    inputs: MarketQuotePriceInput[],
  ): Promise<MarketQuoteSubmissionResult>;
  revokeMarketQuote(supcId: string): Promise<void>;
  getYarnQualityStandards(
    productId: string,
    signal?: AbortSignal,
  ): Promise<YarnQualityStandards>;
  getSubscriptionGrants(signal?: AbortSignal): Promise<SubscriptionGrantList>;
  getSubscriptionUsers(signal?: AbortSignal): Promise<SubscriptionUserList>;
  sendSubscription(
    grantId: number,
    input: SendSubscriptionInput,
  ): Promise<SendSubscriptionResult>;
  sendSubscriptionToUser(
    userKey: number,
    input: SendSubscriptionUserInput,
  ): Promise<SendSubscriptionResult>;
}

export class GatewayError extends Error {
  constructor(
    public readonly status: number,
    public readonly errorCode: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export function asGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new GatewayError(499, "REQUEST_ABORTED", "请求已取消");
  }
  return new GatewayError(
    0,
    "NETWORK_ERROR",
    error instanceof Error ? error.message : "网络连接失败，请稍后重试",
  );
}

export function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `h5-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
