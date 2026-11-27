/** Server-only application client. Separate credentials and contract from the employee WSS client. */
export interface AnalysisInput {
  /** Stable business user within this authenticated client + tenant. Enables persistent Codex context (FORGE_FLEX only). */
  externalUserId?: string;
  agentId: 'it-support-partner';
  tenantId: string;
  problemId: string;
  conversationId: string;
  /** Persist with the complete input before submission. Never replace it merely because of a timeout. */
  requestId: string;
  title: string;
  description: string;
  recentContext?: string[];
  classification?: { decision: 'IT' | 'NOT_IT' | 'UNKNOWN'; reason: string };
  /** Stable IDs from the administrator-approved Forge ProjectCatalog, not display names. */
  systemIds?: string[];
  errorText?: string;
  attachmentTexts?: { id: string; name: string; text: string }[];
  /** IDs uploaded using this exact application credential. Raw images are never replaced by OCR text. */
  attachmentIds?: string[];
  /** Application-owned originals. Submit references only and omit attachmentIds. */
  imageRefs?: { id: string; sha256: string; mediaType: AnalysisImage['mediaType'] }[];
  /** New submissions default to FORGE_FLEX. Existing request IDs retain their original contract. */
  replyMode?: 'FORGE_FLEX' | 'CALLER' | 'FORGE';
  /** Caller-specific presentation/result rules; cannot grant tools, identity or resource access. */
  businessInstructions?: string;
  /** Reported business material/manual experience, never independently verified system facts. */
  businessContext?: unknown;
  evidenceRefs?: { projectId: string; path: string; startLine: number; endLine: number }[];
}

export interface AnalysisResult {
  schemaVersion: '1.0' | '1.1' | '1.2' | '1.3';
  messageAction?: 'REPLY' | 'UPDATE_ONLY' | 'IGNORE';
  session?: { id: string; externalUserId: string; title: string; source: 'CONSULT_SDK' };
  businessResult?: Record<string, unknown> | null;
  understanding: string;
  category: 'ACCESS' | 'PRINTING' | 'DATA' | 'WORKFLOW' | 'INTEGRATION' | 'OTHER' | 'UNKNOWN';
  facts: { text: string; evidenceIds: string[] }[];
  possibleCauses: { description: string; confidence: 'POSSIBLE' | 'SUPPORTED'; evidenceIds: string[] }[];
  recommendations: string[];
  missingInformation: string[];
  unknowns: string[];
  humanHandoff: { recommended: boolean; reason: string };
  evidence: { id: string; kind: 'CALLER_DESCRIPTION' | 'CALLER_BUSINESS_CONTEXT' | 'CALLER_ERROR' | 'CALLER_ATTACHMENT_TEXT' | 'CALLER_IMAGE' | 'CALLER_HISTORY' | 'SERVER_SOURCE'; source: string; text: string }[];
  /** Server-owned coverage statement, separate from the model's unknowns. */
  evidenceLimitations: string;
  replyCandidatesGeneratedBy: 'CALLER' | 'FORGE';
  replyCandidates?: { id: string; text: string; evidenceIds: string[] }[];
  imageInputs?: (AnalysisImage | ExternalAnalysisImage)[];
  imageObservations?: { attachmentId: string; readable: boolean; observation: string }[];
}

export interface AnalysisImage {
  attachmentId: string;
  uploadId: string;
  sha256: string;
  mediaType: 'image/png' | 'image/jpeg';
  size: number;
  width: number;
  height: number;
  createdAt: number;
  expiresAt: number;
}

export type ExternalAnalysisImage = Omit<AnalysisImage, 'attachmentId' | 'uploadId' | 'createdAt' | 'expiresAt'>
  & { attachmentId: `external-${string}`; uploadId?: never; createdAt?: never; expiresAt?: never };

export interface AnalysisTask {
  externalUserId?: string;
  taskId: string;
  requestId: string;
  problemId: string;
  conversationId: string;
  status: 'QUEUED' | 'RUNNING' | 'CANCEL_REQUESTED' | 'SUCCEEDED' | 'NEEDS_INFORMATION' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT' | 'INTERRUPTED';
  result: AnalysisResult | null;
  error: { code: string; message: string; retryable: boolean } | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  policyVersion: number | null;
  attachmentIds?: string[];
}

export class ConsultBackendError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number,
    public readonly retryable = false, public readonly traceId?: string,
    public readonly details?: Record<string, unknown>) { super(message); this.name = 'ConsultBackendError'; }
}

export interface BackendClientOptions {
  baseUrl: string;
  clientId: string;
  /** Supply from server secret storage; never employee, database or model credentials. */
  getClientSecret: () => string | Promise<string>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  /** Overall wait for the direct analysis response. Align with Forge and proxy timeouts. */
  analyzeOnceTimeoutMs?: number;
}

export class ForgeConsultBackendClient {
  private readonly origin: string;
  private readonly fetcher: typeof globalThis.fetch;
  private accessToken?: { value: string; expires: number };
  private tokenPromise?: Promise<string>;

  constructor(private readonly options: BackendClientOptions) {
    if (typeof window !== 'undefined') throw new ConsultBackendError('SERVER_ONLY', '应用凭据客户端只能在服务器运行');
    const url = new URL(options.baseUrl);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new ConsultBackendError('INVALID_URL', 'baseUrl 必须为无凭据的站点根地址');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      throw new ConsultBackendError('HTTPS_REQUIRED', '后端调用须使用 HTTPS');
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(options.clientId)) throw new ConsultBackendError('INVALID_CLIENT_ID', 'clientId 无效');
    if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 120000))
      throw new ConsultBackendError('INVALID_TIMEOUT', 'timeoutMs 须为 1–120000ms');
    if (options.analyzeOnceTimeoutMs !== undefined && (!Number.isInteger(options.analyzeOnceTimeoutMs)
      || options.analyzeOnceTimeoutMs < 1 || options.analyzeOnceTimeoutMs > 620000))
      throw new ConsultBackendError('INVALID_TIMEOUT', 'analyzeOnceTimeoutMs 须为 1–620000ms');
    this.origin = url.origin;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async submit(input: AnalysisInput): Promise<AnalysisTask> {
    return this.request('/analysis-tasks', { method: 'POST', body: JSON.stringify(input), headers: { 'Content-Type': 'application/json' } });
  }

  async analyzeOnce(input: Omit<AnalysisInput, 'attachmentIds'>): Promise<{ requestId: string; result: AnalysisResult }> {
    try {
      const response = await this.authorized('/analyze-once', { method: 'POST', body: JSON.stringify(input),
        headers: { 'Content-Type': 'application/json' } }, this.options.analyzeOnceTimeoutMs ?? 195000);
      if (response?.requestId !== input.requestId || !['1.0', '1.1', '1.2', '1.3'].includes(response?.result?.schemaVersion))
        throw new ConsultBackendError('INVALID_RESPONSE', '即时分析响应不符合合同');
      if (input.externalUserId && (response.result.schemaVersion !== '1.3'
        || response.result.session?.externalUserId !== input.externalUserId
        || response.result.session?.source !== 'CONSULT_SDK'
        || !['REPLY', 'UPDATE_ONLY', 'IGNORE'].includes(response.result.messageAction)))
        throw new ConsultBackendError('INVALID_RESPONSE', '连续答疑响应身份或处理动作不符合合同');
      return response;
    } catch (error) {
      if (!input.externalUserId && error instanceof ConsultBackendError && error.code === 'REQUEST_STATUS_UNKNOWN')
        throw new ConsultBackendError('DIRECT_RESPONSE_LOST', '未收到即时分析结果，调用方可重新发起分析', undefined, true);
      throw error;
    }
  }

  /** Persist uploadId and the original bytes before calling. No automatic upload retries. */
  async uploadImage(uploadId: string, bytes: Uint8Array, mediaType: AnalysisImage['mediaType']): Promise<AnalysisImage> {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(uploadId) || !['image/png', 'image/jpeg'].includes(mediaType)
      || !(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > 5 * 1024 * 1024)
      throw new ConsultBackendError('INVALID_IMAGE_INPUT', '须提供 uploadId、PNG/JPEG 原始字节，单张不超过 5MiB');
    return this.imageRequest(`/attachments?uploadId=${encodeURIComponent(uploadId)}`, {
      method: 'POST', headers: { 'Content-Type': mediaType }, body: new Blob([new Uint8Array(bytes)], { type: mediaType }),
    });
  }

  async findImage(uploadId: string): Promise<AnalysisImage> {
    return this.imageRequest(`/attachments?uploadId=${encodeURIComponent(uploadId)}`, { method: 'GET' });
  }

  /** Read-only lookup, scoped to this client's identity; 404 means upload is needed. */
  async findReusableImage(sha256: string, mediaType: AnalysisImage['mediaType'], minValiditySeconds = 600): Promise<AnalysisImage> {
    if (!/^[a-fA-F0-9]{64}$/.test(sha256) || !['image/png', 'image/jpeg'].includes(mediaType)
      || !Number.isInteger(minValiditySeconds) || minValiditySeconds < 0 || minValiditySeconds > 86400)
      throw new ConsultBackendError('INVALID_IMAGE_INPUT', '复用查询须提供摘要、图片类型及有效期');
    const requestedUntil = Date.now() + minValiditySeconds * 1000;
    const image = await this.imageRequest(`/attachments/reusable?sha256=${sha256.toLowerCase()}&mediaType=${encodeURIComponent(mediaType)}&minValiditySeconds=${minValiditySeconds}`, { method: 'GET' });
    if (image.sha256 !== sha256.toLowerCase() || image.mediaType !== mediaType || image.expiresAt <= requestedUntil)
      throw new ConsultBackendError('INVALID_IMAGE_RESPONSE', '复用回执与摘要、媒体类型或有效期不一致');
    return image;
  }

  /** Recover the original upload first, then reuse matching live content. Never retries an uncertain POST. */
  async uploadOrReuseImage(uploadId: string, bytes: Uint8Array, mediaType: AnalysisImage['mediaType']): Promise<AnalysisImage> {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(uploadId) || !['image/png', 'image/jpeg'].includes(mediaType)
      || !(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > 5 * 1024 * 1024)
      throw new ConsultBackendError('INVALID_IMAGE_INPUT', '须提供 uploadId、PNG/JPEG 原始字节，单张不超过 5MiB');
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
    const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
    try {
      const existing = await this.findImage(uploadId);
      if (existing.sha256 !== hash || existing.mediaType !== mediaType)
        throw new ConsultBackendError('UPLOAD_IDEMPOTENCY_CONFLICT', '相同 uploadId 已用于不同图片或类型', 409);
      return existing;
    } catch (error) { if (!this.imageMissing(error)) throw error; }
    try { return await this.findReusableImage(hash, mediaType); }
    catch (error) { if (!this.imageMissing(error)) throw error; }
    return this.uploadImage(uploadId, bytes, mediaType);
  }

  private imageMissing(error: unknown): boolean {
    return error instanceof ConsultBackendError && error.status === 404 && error.code === 'ATTACHMENT_NOT_FOUND';
  }

  async getImage(attachmentId: string): Promise<AnalysisImage> {
    return this.imageRequest(`/attachments/${encodeURIComponent(attachmentId)}`, { method: 'GET' });
  }

  async get(taskId: string): Promise<AnalysisTask> {
    return this.request(`/analysis-tasks/${encodeURIComponent(taskId)}`, { method: 'GET' });
  }

  async find(requestId: string): Promise<AnalysisTask> {
    return this.request(`/analysis-tasks?requestId=${encodeURIComponent(requestId)}`, { method: 'GET' });
  }

  async cancel(taskId: string): Promise<AnalysisTask> {
    return this.request(`/analysis-tasks/${encodeURIComponent(taskId)}/cancel`, { method: 'POST' });
  }

  /** Explicitly retry authentication after credential rotation. Does not resend any business question. */
  resetAuthentication(): void { this.accessToken = undefined; }

  private async token(): Promise<string> {
    if (this.accessToken && this.accessToken.expires > Date.now() + 5000) return this.accessToken.value;
    if (this.tokenPromise) return this.tokenPromise;
    this.tokenPromise = (async () => {
      const secret = await this.options.getClientSecret();
      if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw new ConsultBackendError('INVALID_CLIENT_SECRET', '须提供管理员签发的服务凭据');
      const response = await this.fetch('/token', { method: 'POST', headers: {
        Authorization: `Basic ${btoa(`${this.options.clientId}:${secret}`)}`, 'Content-Type': 'application/x-www-form-urlencoded',
      }, body: 'grant_type=client_credentials' });
      const token = await this.decode(response);
      if (typeof token.access_token !== 'string' || !/^fct_[A-Za-z0-9_-]{43}$/.test(token.access_token)
        || token.token_type !== 'Bearer' || !Number.isFinite(token.expires_in) || token.expires_in < 1 || token.expires_in > 900)
        throw new ConsultBackendError('INVALID_TOKEN_RESPONSE', '认证响应不符合合同');
      this.accessToken = { value: token.access_token, expires: Date.now() + token.expires_in * 1000 };
      return token.access_token as string;
    })();
    try { return await this.tokenPromise; } finally { this.tokenPromise = undefined; }
  }

  private async request(path: string, init: RequestInit): Promise<AnalysisTask> {
    const task = await this.authorized(path, init);
    if (!task || typeof task.taskId !== 'string' || typeof task.requestId !== 'string'
      || !['QUEUED', 'RUNNING', 'CANCEL_REQUESTED', 'SUCCEEDED', 'NEEDS_INFORMATION', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'INTERRUPTED'].includes(task.status))
      throw new ConsultBackendError('INVALID_TASK_RESPONSE', '任务响应不符合合同，请保留原 requestId 核对');
    return task as AnalysisTask;
  }

  private async imageRequest(path: string, init: RequestInit): Promise<AnalysisImage> {
    const image = await this.authorized(path, init);
    if (!image || typeof image.attachmentId !== 'string' || !/^img_[a-f0-9-]{36}$/.test(image.attachmentId)
      || typeof image.uploadId !== 'string' || typeof image.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(image.sha256)
      || !['image/png', 'image/jpeg'].includes(image.mediaType) || !Number.isInteger(image.size) || image.size < 1 || image.size > 5 * 1024 * 1024
      || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1
      || image.width > 10000 || image.height > 10000 || image.width * image.height > 20000000
      || !Number.isFinite(image.createdAt) || !Number.isFinite(image.expiresAt) || image.expiresAt <= image.createdAt)
      throw new ConsultBackendError('INVALID_IMAGE_RESPONSE', '图片响应不符合合同，请保留原 uploadId 核对');
    return image as AnalysisImage;
  }

  private async authorized(path: string, init: RequestInit, timeoutMs?: number): Promise<any> {
    const token = await this.token();
    const response = await this.fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } }, timeoutMs);
    if (response.status === 401) this.accessToken = undefined;
    return this.decode(response);
  }

  private async fetch(path: string, init: RequestInit, timeoutMs = this.options.timeoutMs ?? 15000): Promise<Response> {
    try {
      return await this.fetcher(this.origin + '/api/fore-consult/v1' + path, {
        ...init, redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ConsultBackendError('REQUEST_STATUS_UNKNOWN', '请求超时或连接中断，请用原 requestId 或 uploadId 查询；未自动重发', undefined, true);
    }
  }

  private async decode(response: Response): Promise<any> {
    let value: any;
    try { value = await response.json(); }
    catch { throw new ConsultBackendError('INVALID_RESPONSE', '接口返回了无效 JSON，请保留原请求标识核对'); }
    if (!response.ok) throw new ConsultBackendError(typeof value?.code === 'string' ? value.code : `HTTP_${response.status}`,
      typeof value?.message === 'string' ? value.message : '接口请求未完成', response.status, value?.retryable === true, value?.traceId,
      value?.details && typeof value.details === 'object' && !Array.isArray(value.details) ? value.details : undefined);
    return value;
  }
}
