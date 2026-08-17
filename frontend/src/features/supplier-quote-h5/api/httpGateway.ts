import {
  GatewayError,
  createIdempotencyKey,
  type DraftReceipt,
  type QuotationAccess,
  type QuotationDraftInput,
  type RegistrationInvitation,
  type RegistrationRequest,
  type RegistrationResult,
  type AccountBindingResult,
  type MarketQuotePage,
  type MarketQuoteSubmissionResult,
  type YarnQualityStandards,
  type SubmissionReceipt,
  type SupplierQuoteGateway,
  type VerificationCodeReceipt,
  type VerificationCodeRequest,
} from "./contract";

interface HttpGatewayConfig {
  apiBaseUrl: string;
  marketQuoteApiBaseUrl?: string;
}

interface ErrorPayload {
  errorCode?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export function createHttpSupplierQuoteGateway(
  config: HttpGatewayConfig,
): SupplierQuoteGateway {
  const baseUrl = config.apiBaseUrl.replace(/\/$/, "");
  const marketBaseUrl = (
    config.marketQuoteApiBaseUrl ?? config.apiBaseUrl
  ).replace(/\/$/, "");

  return {
    getWechatSession: (returnTo, signal) =>
      request(
        baseUrl,
        `/public/wechat/session?returnTo=${encodeURIComponent(returnTo)}`,
        { signal },
      ),
    bindBusinessAccount: (requestBody) =>
      request<AccountBindingResult>(baseUrl, "/public/account-bindings", {
        method: "POST",
        body: JSON.stringify(requestBody),
      }),
    getRegistrationInvitation: (ticket, signal) =>
      request<RegistrationInvitation>(
        baseUrl,
        `/public/registration-invitations/${encodeURIComponent(ticket)}`,
        { signal },
      ),
    sendVerificationCode: (requestBody) =>
      request<VerificationCodeReceipt>(baseUrl, "/public/verification-codes", {
        method: "POST",
        body: JSON.stringify(requestBody),
      }),
    registerWithInvitation: (requestBody) =>
      request<RegistrationResult>(
        baseUrl,
        "/public/registrations",
        withIdempotency(requestBody.idempotencyKey, requestBody),
      ),
    getQuotationAccess: (ticket, signal) =>
      request<QuotationAccess>(
        baseUrl,
        `/public/quotation-access/${encodeURIComponent(ticket)}`,
        { signal },
      ),
    saveDraft: (ticket, requestBody) =>
      request<DraftReceipt>(
        baseUrl,
        `/public/quotation-access/${encodeURIComponent(ticket)}/draft`,
        withIdempotency(requestBody.idempotencyKey, requestBody, "PUT"),
      ),
    submitQuotation: (ticket, requestBody) =>
      request<SubmissionReceipt>(
        baseUrl,
        `/public/quotation-access/${encodeURIComponent(ticket)}/submit`,
        withIdempotency(requestBody.idempotencyKey, {
          ...requestBody,
          confirmed: true,
        }),
      ),
    getMarketQuotePage: (query, signal) => {
      const params = new URLSearchParams({
        pageNo: String(query.pageNo),
        pageSize: String(query.pageSize),
        tab: query.tab,
        productName: query.productName,
        status: query.status,
      });
      return request<MarketQuotePage>(
        marketBaseUrl,
        `/admin/h5/market-price-quotes?${params}`,
        { signal },
      );
    },
    submitMarketQuote: (input) =>
      request<MarketQuoteSubmissionResult>(
        marketBaseUrl,
        `/admin/h5/market-price-quotes/${encodeURIComponent(input.supcId)}/submit`,
        withIdempotency(createIdempotencyKey(), input),
      ),
    submitMarketQuotes: (items) =>
      request<MarketQuoteSubmissionResult>(
        marketBaseUrl,
        "/admin/h5/market-price-quotes/batch-submit",
        withIdempotency(createIdempotencyKey(), { items }),
      ),
    revokeMarketQuote: (supcId) =>
      request<void>(
        marketBaseUrl,
        `/admin/h5/market-price-quotes/${encodeURIComponent(supcId)}/revoke`,
        { method: "PUT" },
      ),
    getYarnQualityStandards: (productId, signal) =>
      request<YarnQualityStandards>(
        marketBaseUrl,
        `/admin/h5/market-price-quotes/products/${encodeURIComponent(productId)}/quality-standards`,
        { signal },
      ),
  };
}

function withIdempotency(
  idempotencyKey: string,
  body: unknown,
  method = "POST",
): RequestInit {
  return {
    method,
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(body),
  };
}

async function request<T>(
  baseUrl: string,
  path: string,
  init: RequestInit,
): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  init.signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 8_000);
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch (error) {
    if (
      init.signal?.aborted &&
      error instanceof DOMException &&
      error.name === "AbortError"
    )
      throw error;
    if (timedOut)
      throw new GatewayError(
        0,
        "NETWORK_TIMEOUT",
        "报价服务响应超时，请确认 Forge 后端已启动",
      );
    throw new GatewayError(
      0,
      "NETWORK_ERROR",
      "无法连接报价服务，请检查网络后重试",
    );
  } finally {
    globalThis.clearTimeout(timeoutId);
    init.signal?.removeEventListener("abort", abortFromCaller);
  }

  if (!response.ok) {
    const payload = await readErrorPayload(response);
    throw new GatewayError(
      response.status,
      payload.errorCode ?? `HTTP_${response.status}`,
      payload.message ?? `请求失败，HTTP ${response.status}`,
      payload.details,
    );
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function readErrorPayload(
  response: Response,
): Promise<Required<ErrorPayload>> {
  try {
    const payload = (await response.json()) as ErrorPayload;
    return {
      errorCode: payload.errorCode ?? "",
      message: payload.message ?? "",
      details: payload.details ?? {},
    };
  } catch {
    return { errorCode: "", message: "", details: {} };
  }
}
