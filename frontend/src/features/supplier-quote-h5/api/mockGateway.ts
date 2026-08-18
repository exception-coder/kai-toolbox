import {
  GatewayError,
  type DraftReceipt,
  type QuotationAccess,
  type QuotationDraftInput,
  type RegistrationInvitation,
  type RegistrationRequest,
  type RegistrationResult,
  type MarketQuoteItem,
  type MarketQuoteSubmissionResult,
  type SubmissionReceipt,
  type SupplierQuoteGateway,
  type VerificationCodeReceipt,
  type SubscriptionGrant,
} from "./contract";

const MOCK_DELAY_MS = 320;

export function createMockSupplierQuoteGateway(): SupplierQuoteGateway {
  const drafts = new Map<string, QuotationDraftInput>();
  const submissions = new Map<string, SubmissionReceipt>();
  let marketItems = marketQuoteFixtures();
  let subscriptions: SubscriptionGrant[] = [
    {
      id: 1,
      status: "AVAILABLE" as const,
      accountLabel: "王经理",
      supplierName: "广州睿程服饰有限公司",
      createdAt: Date.now() - 12 * 60_000,
      sentAt: null,
      resultCode: null,
      resultMessage: null,
      attemptCount: 0,
      bound: true,
    },
  ];

  return {
    async getWechatSession() {
      await delay();
      return {
        authenticated: true,
        bound: true,
        authorizeUrl: null,
        binding: {
          accountId: "demo-account-001",
          username: "supplier-demo",
          displayName: "王经理",
          supplierId: "supplier-demo-001",
          supplierName: "广州睿程服饰有限公司",
          sourceSystem: "DEMO",
        },
      };
    },
    async getSubscriptionGrants() {
      await delay();
      return {
        items: structuredClone(subscriptions),
        availableCount: subscriptions.filter((item) => item.status === "AVAILABLE").length,
      };
    },
    async getSubscriptionUsers() {
      await delay();
      const availableCount = subscriptions.filter((item) => item.status === "AVAILABLE" || item.status === "FAILED").length;
      return {
        items: [{
          userKey: subscriptions[0]?.id ?? 1,
          accountLabel: subscriptions[0]?.accountLabel ?? "王经理",
          supplierName: subscriptions[0]?.supplierName ?? "广州睿程服饰有限公司",
          availableCount,
          totalCount: subscriptions.length,
          latestCreatedAt: subscriptions[0]?.createdAt ?? Date.now(),
          latestResultCode: subscriptions[0]?.resultCode ?? null,
          latestResultMessage: subscriptions[0]?.resultMessage ?? null,
          bound: true,
        }],
        availableCount,
        totalCount: subscriptions.length,
      };
    },
    async sendSubscription(grantId) {
      await delay();
      subscriptions = subscriptions.map((item) =>
        item.id === grantId
          ? { ...item, status: "SENT" as const, sentAt: Date.now(), resultCode: "0", resultMessage: "ok", attemptCount: item.attemptCount + 1 }
          : item,
      );
      return { grantId, status: "SENT", resultCode: "0", resultMessage: "ok" };
    },
    async sendSubscriptionToUser() {
      await delay();
      const grant = subscriptions.find((item) => item.status === "AVAILABLE" || item.status === "FAILED");
      if (!grant) throw new GatewayError(409, "SUBSCRIPTION_GRANT_EXHAUSTED", "当前没有剩余可推送次数");
      subscriptions = subscriptions.map((item) => item.id === grant.id
        ? { ...item, status: "SENT" as const, sentAt: Date.now(), resultCode: "0", resultMessage: "ok", attemptCount: item.attemptCount + 1 }
        : item);
      return { grantId: grant.id, status: "SENT" as const, resultCode: "0", resultMessage: "ok" };
    },
    async bindBusinessAccount(request) {
      await delay();
      if (
        request.username !== "supplier-demo" ||
        request.password !== "123456"
      ) {
        throw new GatewayError(
          401,
          "BUSINESS_CREDENTIALS_INVALID",
          "业务账号或密码不正确",
        );
      }
      return {
        binding: {
          accountId: "demo-account-001",
          username: request.username,
          displayName: "王经理",
          supplierId: "supplier-demo-001",
          supplierName: "广州睿程服饰有限公司",
          sourceSystem: "DEMO",
        },
        returnTo: request.returnTo,
      };
    },
    async getRegistrationInvitation(ticket, signal) {
      await delay(signal);
      assertInvitationAvailable(ticket);
      return invitationFixture(ticket);
    },
    async sendVerificationCode() {
      await delay();
      return {
        cooldownSeconds: 60,
        expiresInSeconds: 300,
        maskedMobile: "138****1234",
      };
    },
    async registerWithInvitation(request) {
      await delay();
      assertInvitationAvailable(request.invitationTicket);
      if (request.verificationCode !== "123456") {
        throw new GatewayError(
          400,
          "VERIFICATION_CODE_INVALID",
          "验证码不正确，演示验证码为 123456",
        );
      }
      if (!request.acceptedTerms)
        throw new GatewayError(400, "TERMS_REQUIRED", "请先同意门户服务协议");
      return {
        portalUserId: "pu_demo_01",
        contactBindingStatus: "ACTIVE",
        displayName: request.name,
        returnPath: "/q/demo-quote",
      };
    },
    async getQuotationAccess(ticket, signal) {
      await delay(signal);
      if (ticket.includes("invalid"))
        throw new GatewayError(404, "QUOTE_TICKET_NOT_FOUND", "报价链接不存在");
      if (ticket.includes("forbidden"))
        throw new GatewayError(
          403,
          "QUOTE_TICKET_FORBIDDEN",
          "该报价链接不属于当前微信账号",
        );
      if (ticket.includes("unbound")) {
        throw new GatewayError(
          401,
          "REGISTRATION_REQUIRED",
          "完成邀请注册后即可报价",
          {
            invitationTicket: "demo-invite",
            returnPath: `/q/${ticket}`,
          },
        );
      }
      const quotation = quotationFixture(ticket, drafts.get(ticket));
      const submitted = submissions.get(ticket);
      return submitted
        ? {
            ...quotation,
            status: "SUBMITTED",
            editable: false,
            submittedAt: submitted.submittedAt,
            erpSyncStatus: submitted.erpSyncStatus,
          }
        : quotation;
    },
    async saveDraft(ticket, request) {
      await delay();
      assertQuotationWritable(ticket, submissions);
      drafts.set(ticket, structuredClone(request));
      return {
        draftVersion: request.draftVersion + 1,
        savedAt: new Date().toISOString(),
      };
    },
    async submitQuotation(ticket, request) {
      await delay();
      assertQuotationWritable(ticket, submissions);
      drafts.set(ticket, structuredClone(request));
      const receipt: SubmissionReceipt = {
        submissionId: `sub_${Date.now()}`,
        submittedAt: new Date().toISOString(),
        requestNo: "XJ20260815018",
        erpSyncStatus: "PENDING",
      };
      submissions.set(ticket, receipt);
      return receipt;
    },
    async getMarketQuotePage(query, signal) {
      await delay(signal);
      const filtered = marketItems.filter((item) => {
        if (query.tab === "PENDING" && !item.haveTask) return false;
        if (query.status && item.status !== query.status) return false;
        const keyword = query.productName.trim().toLowerCase();
        return (
          !keyword ||
          `${item.productCode}${item.productName}${item.colorCode}${item.colorName}`
            .toLowerCase()
            .includes(keyword)
        );
      });
      return {
        items: structuredClone(filtered),
        total: filtered.length,
        pendingCount: marketItems.filter((item) => item.haveTask).length,
        pageNo: query.pageNo,
        pageSize: query.pageSize,
      };
    },
    async submitMarketQuote(input) {
      await delay();
      return submitMarketItems([input]);
    },
    async submitMarketQuotes(inputs) {
      await delay();
      return submitMarketItems(inputs);
    },
    async revokeMarketQuote(supcId) {
      await delay();
      marketItems = marketItems.map((item) =>
        item.supcId === supcId
          ? {
              ...item,
              status: "PENDING_QUOTE",
              haveTask: true,
              canQuote: true,
              canRevoke: false,
            }
          : item,
      );
    },
    async getYarnQualityStandards(_productId, signal) {
      await delay(signal);
      return {
        twist: "820 T/m",
        twistCv: "≤ 4.0%",
        strength: "≥ 18.5 cN/tex",
        strengthCv: "≤ 6.5%",
        evennessCv: "≤ 12.0%",
        thinPlaces: "≤ 2 个/km",
        thickPlaces: "≤ 18 个/km",
        neps: "≤ 25 个/km",
        hairinessIndex: "≤ 4.2",
        foreignFiberCount: "≤ 3 根/20kg",
      };
    },
  };

  function submitMarketItems(
    inputs: Array<{
      supcId: string;
      priceIncludeTax: string;
      priceExcludeTax: string;
    }>,
  ): MarketQuoteSubmissionResult {
    const succeededIds: string[] = [];
    const failures: MarketQuoteSubmissionResult["failures"] = [];
    for (const input of inputs) {
      const item = marketItems.find(
        (candidate) => candidate.supcId === input.supcId,
      );
      if (!item?.canQuote) {
        failures.push({ supcId: input.supcId, message: "当前记录不可报价" });
        continue;
      }
      succeededIds.push(input.supcId);
      marketItems = marketItems.map((candidate) =>
        candidate.supcId === input.supcId
          ? {
              ...candidate,
              status: "PENDING_AUDIT",
              haveTask: false,
              canQuote: false,
              canRevoke: true,
              lastQuotedAt: new Date().toISOString(),
              lastPriceIncludeTax: input.priceIncludeTax,
              lastPriceExcludeTax: input.priceExcludeTax,
            }
          : candidate,
      );
    }
    return { succeededIds, failures };
  }
}

function marketQuoteFixtures(): MarketQuoteItem[] {
  return [
    {
      supcId: "82031",
      productId: "P-1001",
      productCode: "YRN-40S-017",
      productName: "40S 精梳棉紧密纺",
      colorCode: "C-090",
      colorName: "深海藏青",
      colorGrade: "A级",
      certification: "OEKO-TEX",
      lastQuotedAt: "2026-07-28T08:30:00+08:00",
      lastPriceIncludeTax: "25.80",
      lastPriceExcludeTax: "22.83",
      status: "PENDING_QUOTE",
      auditReason: null,
      haveTask: true,
      canQuote: true,
      canRevoke: false,
    },
    {
      supcId: "82032",
      productId: "P-1002",
      productCode: "YRN-32S-204",
      productName: "32S 兰精粘胶纱",
      colorCode: "C-112",
      colorName: "雾松绿",
      colorGrade: "A级",
      certification: "FSC",
      lastQuotedAt: "2026-08-02T11:20:00+08:00",
      lastPriceIncludeTax: "19.60",
      lastPriceExcludeTax: "17.35",
      status: "REQUOTE",
      auditReason: "含税价高于本轮目标区间，请结合原料行情重新核价。",
      haveTask: true,
      canQuote: true,
      canRevoke: false,
    },
    {
      supcId: "82033",
      productId: "P-1003",
      productCode: "YRN-21S-089",
      productName: "21S 再生涤棉混纺",
      colorCode: "C-001",
      colorName: "本白",
      colorGrade: "B级",
      certification: "GRS",
      lastQuotedAt: "2026-08-12T09:10:00+08:00",
      lastPriceIncludeTax: "16.20",
      lastPriceExcludeTax: "14.34",
      status: "PENDING_AUDIT",
      auditReason: null,
      haveTask: false,
      canQuote: false,
      canRevoke: true,
    },
    {
      supcId: "82034",
      productId: "P-1004",
      productCode: "YRN-60S-031",
      productName: "60S 莫代尔紧密赛络纺",
      colorCode: "C-038",
      colorName: "暖砂灰",
      colorGrade: "A级",
      certification: null,
      lastQuotedAt: "2026-07-19T13:40:00+08:00",
      lastPriceIncludeTax: "31.40",
      lastPriceExcludeTax: "27.79",
      status: "APPROVED",
      auditReason: null,
      haveTask: false,
      canQuote: false,
      canRevoke: false,
    },
  ];
}

function invitationFixture(ticket: string): RegistrationInvitation {
  return {
    invitationId: `inv_${ticket}`,
    status: "AVAILABLE",
    supplier: { displayName: "广州睿程服饰有限公司" },
    contact: { displayName: "王经理", maskedMobile: "138****1234" },
    defaults: {
      name: "王明",
      mobile: "13800001234",
      companyName: "广州睿程服饰有限公司",
      position: "业务经理",
    },
    verificationRequired: true,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    returnPath: "/q/demo-quote",
  };
}

function quotationFixture(
  ticket: string,
  draft?: QuotationDraftInput,
): QuotationAccess {
  const state = ticket.includes("closed")
    ? "CLOSED"
    : ticket.includes("submitted")
      ? "SUBMITTED"
      : "OPEN";
  const defaults = [
    {
      itemId: "item_01",
      unitPrice: "18.6000",
      taxRate: "13",
      deliveryDays: 12,
      moq: "1000",
      remark: "含税含运",
    },
    {
      itemId: "item_02",
      unitPrice: "",
      taxRate: "13",
      deliveryDays: 15,
      moq: "800",
      remark: "",
    },
  ];
  const lineDrafts = draft?.items ?? defaults;
  return {
    quotationId: "qr_20260815018",
    requestNo: "XJ20260815018",
    title: "秋冬针织面料询价",
    buyerName: "凯纺供应链",
    supplierName: "广州睿程服饰有限公司",
    contactName: "王经理",
    status: state,
    editable: state === "OPEN",
    deadline: new Date(Date.now() + 36 * 60 * 60 * 1000).toISOString(),
    currency: "CNY",
    taxIncluded: true,
    overallRemark: draft?.overallRemark ?? "",
    draftVersion: draft?.draftVersion ? draft.draftVersion + 1 : 1,
    items: [
      {
        itemId: "item_01",
        materialCode: "MAT-4012",
        materialName: "40S锦氨罗马布",
        specification: "320g/m² · 门幅150cm · 黑色",
        quantity: "5000",
        unit: "米",
        draft: lineDrafts[0],
      },
      {
        itemId: "item_02",
        materialCode: "MAT-2871",
        materialName: "32S精梳棉双面布",
        specification: "280g/m² · 门幅165cm · 藏青",
        quantity: "3200",
        unit: "公斤",
        draft: lineDrafts[1],
      },
    ],
    submittedAt: state === "SUBMITTED" ? new Date().toISOString() : null,
    erpSyncStatus: state === "SUBMITTED" ? "SYNCED" : "NOT_STARTED",
  };
}

function assertInvitationAvailable(ticket: string) {
  if (ticket.includes("expired"))
    throw new GatewayError(
      410,
      "INVITATION_EXPIRED",
      "邀请已过期，请联系业务员重新发送",
    );
  if (ticket.includes("used"))
    throw new GatewayError(
      409,
      "INVITATION_CONSUMED",
      "邀请已被其他微信账号使用",
    );
  if (ticket.includes("invalid"))
    throw new GatewayError(
      404,
      "INVITATION_NOT_FOUND",
      "邀请链接不存在或已被撤销",
    );
}

function assertQuotationWritable(
  ticket: string,
  submissions: Map<string, SubmissionReceipt>,
) {
  if (ticket.includes("closed"))
    throw new GatewayError(410, "QUOTATION_CLOSED", "本次询价已截止");
  if (ticket.includes("submitted") || submissions.has(ticket)) {
    throw new GatewayError(
      409,
      "QUOTATION_ALREADY_SUBMITTED",
      "该报价已经提交，请勿重复操作",
    );
  }
}

function delay(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(resolve, MOCK_DELAY_MS);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
