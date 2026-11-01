/** Server-only application client. Separate credentials and contract from the employee WSS client. */
export interface AnalysisInput {
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
  evidenceRefs?: { projectId: string; path: string; startLine: number; endLine: number }[];
}

export interface AnalysisResult {
  schemaVersion: '1.0';
  understanding: string;
  category: 'ACCESS' | 'PRINTING' | 'DATA' | 'WORKFLOW' | 'INTEGRATION' | 'OTHER' | 'UNKNOWN';
  facts: { text: string; evidenceIds: string[] }[];
  possibleCauses: { description: string; confidence: 'POSSIBLE' | 'SUPPORTED'; evidenceIds: string[] }[];
  recommendations: string[];
  missingInformation: string[];
  unknowns: string[];
  humanHandoff: { recommended: boolean; reason: string };
  evidence: { id: string; kind: 'CALLER_DESCRIPTION' | 'CALLER_ERROR' | 'CALLER_ATTACHMENT_TEXT' | 'SERVER_SOURCE'; source: string; text: string }[];
  /** Server-owned coverage statement, separate from the model's unknowns. */
  evidenceLimitations: string;
  replyCandidatesGeneratedBy: 'CALLER';
}

export interface AnalysisTask {
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
}

export class ConsultBackendError extends Error {
  constructor(public readonly code: string, message: string, public readonly status?: number,
    public readonly retryable = false, public readonly traceId?: string) { super(message); this.name = 'ConsultBackendError'; }
}

export interface BackendClientOptions {
  baseUrl: string;
  clientId: string;
  /** Supply from server secret storage; never employee, database or model credentials. */
  getClientSecret: () => string | Promise<string>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
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
    this.origin = url.origin;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async submit(input: AnalysisInput): Promise<AnalysisTask> {
    return this.request('/analysis-tasks', { method: 'POST', body: JSON.stringify(input), headers: { 'Content-Type': 'application/json' } });
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
    const token = await this.token();
    const response = await this.fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
    if (response.status === 401) this.accessToken = undefined;
    const task = await this.decode(response);
    if (!task || typeof task.taskId !== 'string' || typeof task.requestId !== 'string'
      || !['QUEUED', 'RUNNING', 'CANCEL_REQUESTED', 'SUCCEEDED', 'NEEDS_INFORMATION', 'FAILED', 'CANCELLED', 'TIMED_OUT', 'INTERRUPTED'].includes(task.status))
      throw new ConsultBackendError('INVALID_TASK_RESPONSE', '任务响应不符合合同，请保留原 requestId 核对');
    return task as AnalysisTask;
  }

  private async fetch(path: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetcher(this.origin + '/api/fore-consult/v1' + path, {
        ...init, redirect: 'error', signal: AbortSignal.timeout(this.options.timeoutMs ?? 15000),
      });
    } catch {
      throw new ConsultBackendError('REQUEST_STATUS_UNKNOWN', '请求超时或连接中断，请用原 requestId 查询；未自动重发', undefined, true);
    }
  }

  private async decode(response: Response): Promise<any> {
    let value: any;
    try { value = await response.json(); }
    catch { throw new ConsultBackendError('INVALID_RESPONSE', '接口返回了无效 JSON，请保留原请求标识核对'); }
    if (!response.ok) throw new ConsultBackendError(typeof value?.code === 'string' ? value.code : `HTTP_${response.status}`,
      typeof value?.message === 'string' ? value.message : '接口请求未完成', response.status, value?.retryable === true, value?.traceId);
    return value;
  }
}
