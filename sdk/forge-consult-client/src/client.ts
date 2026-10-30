import type { AskInput, ClientCheckpoint, ConsultClientOptions, ConsultEvent, HistoryPage, Receipt, UploadedAttachment } from './types.js';

export class ConsultClientError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'ConsultClientError'; }
}
type Waiter = { resolve: (value: Receipt) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

/** One client binds one consultation. Reconnect restores observation, never resends a business question. */
export class ForgeConsultClient {
  private readonly origin: string;
  private readonly options: ConsultClientOptions;
  private readonly listeners = new Set<(event: ConsultEvent) => void>();
  private socket?: WebSocket;
  private opening?: Promise<void>;
  private checkpoint?: ClientCheckpoint;
  private readonly pending = new Map<string, Waiter>();
  private stopped = false;
  private reconnect = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private heartbeat?: ReturnType<typeof setInterval>;
  private lastPong = 0;
  private connectedAt = 0;
  private generation = 0;

  constructor(options: ConsultClientOptions) {
    const url = new URL(options.baseUrl);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || url.pathname !== '/') throw new ConsultClientError('INVALID_ORIGIN', 'baseUrl 必须是无路径和凭据的 HTTP(S) Origin');
    if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new ConsultClientError('TLS_REQUIRED', '非本机接入必须使用 HTTPS/WSS');
    }
    if ((options.reconnectAttempts ?? 5) < 0 || (options.reconnectAttempts ?? 5) > 10) throw new ConsultClientError('INVALID_OPTIONS', '重连上限须为 0–10');
    this.origin = url.origin;
    this.options = options;
    this.checkpoint = options.checkpoint ? { ...options.checkpoint } : undefined;
  }
  on(listener: (event: ConsultEvent) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  get state(): ClientCheckpoint | undefined { return this.checkpoint ? { ...this.checkpoint } : undefined; }

  async connect(): Promise<void> {
    if (this.stopped) throw new ConsultClientError('CLOSED', '客户端已关闭，请新建客户端');
    if (this.socket?.readyState === 1 && !this.opening) return;
    if (this.opening) return this.opening;
    this.opening = this.open().finally(() => { this.opening = undefined; });
    return this.opening;
  }
  async ask(input: AskInput): Promise<Receipt> { return this.submit('consult.ask', input); }
  /** Reserve a consultation before uploading its first screenshot. This does not send a business question. */
  async create(input: Omit<AskInput, 'consultationId' | 'attachmentIds'>): Promise<Receipt> {
    return this.submit('consult.create', input);
  }
  async resume(checkpoint: ClientCheckpoint): Promise<void> {
    if (this.checkpoint && this.checkpoint.consultationId !== checkpoint.consultationId) throw new ConsultClientError('BOUND_TO_OTHER_CONSULTATION', '请为另一咨询创建独立客户端');
    this.checkpoint = { ...checkpoint };
    const connected = this.socket?.readyState === 1 && !this.opening;
    await this.connect();
    if (connected) this.sendResume();
  }
  async cancel(): Promise<void> {
    const id = this.requireConsultation();
    await this.connect(); this.send({ type: 'consult.cancel', consultationId: id });
  }
  async history(before?: number, limit = 30): Promise<HistoryPage> {
    const id = this.requireConsultation();
    const params = new URLSearchParams({ limit: String(Math.min(100, Math.max(1, limit))) });
    if (before !== undefined) params.set('before', String(before));
    return this.http(`/sessions/${encodeURIComponent(id)}/messages?${params}`, { method: 'GET' });
  }
  async upload(file: Blob, name = 'attachment.png'): Promise<UploadedAttachment> {
    const id = this.requireConsultation();
    if (file.size > 10 * 1024 * 1024) throw new ConsultClientError('FILE_TOO_LARGE', '单个附件最大 10MB，服务端限制仍是最终依据');
    const body = new FormData(); body.append('file', file, name);
    return this.http(`/sessions/${encodeURIComponent(id)}/attachments`, { method: 'POST', body });
  }
  close(): void {
    this.stopped = true; this.generation++;
    clearTimeout(this.reconnectTimer); clearInterval(this.heartbeat);
    this.socket?.close(1000, 'client closed'); this.socket = undefined;
    this.failPending(new ConsultClientError('SEND_STATUS_UNKNOWN', '连接已关闭；关闭不代表取消，请恢复原咨询确认状态'));
  }
  private async submit(type: string, input: AskInput): Promise<Receipt> {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(input.requestId) || !input.question.trim() || input.question.length > 4000) {
      throw new ConsultClientError('INVALID_INPUT', 'requestId 须为 8–100 位字母数字、下划线或短横线；问题须为 1–4000 字符');
    }
    if (this.pending.size) throw new ConsultClientError('REQUEST_PENDING', '请先等待当前请求确认');
    const consultationId = input.consultationId ?? this.checkpoint?.consultationId;
    if (this.checkpoint && consultationId !== this.checkpoint.consultationId) throw new ConsultClientError('BOUND_TO_OTHER_CONSULTATION', '请为另一咨询创建独立客户端');
    await this.connect();
    if (this.pending.size) throw new ConsultClientError('REQUEST_PENDING', '请先等待当前请求确认');
    return new Promise<Receipt>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(input.requestId);
        reject(new ConsultClientError('SEND_STATUS_UNKNOWN', '未收到确认，问题可能已经发送；保留原请求标识并恢复咨询，不自动重发'));
      }, this.options.timeoutMs ?? 20_000);
      this.pending.set(input.requestId, { resolve, reject, timer });
      try { this.send({ type, ...input, consultationId, attachmentIds: input.attachmentIds ?? [] }); }
      catch (error) { clearTimeout(timer); this.pending.delete(input.requestId); reject(error); }
    });
  }
  private async open(): Promise<void> {
    const generation = ++this.generation;
    const ticket = await this.http<{ ticket: string; websocketPath: string }>('/tickets', { method: 'POST' });
    if (this.stopped || generation !== this.generation) throw new ConsultClientError('CLOSED', '连接已取消');
    if (ticket.websocketPath !== '/api/fore-consult/client/ws') throw new ConsultClientError('INCOMPATIBLE_PROTOCOL', '服务端连接路径不兼容');
    const url = new URL(ticket.websocketPath, this.origin); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = (this.options.webSocketFactory ?? (value => new WebSocket(value)))(url.href);
    this.socket = socket;
    this.emit({ type: 'connection', status: 'connecting' });
    await new Promise<void>((resolve, reject) => {
      let authenticated = false;
      const timer = setTimeout(() => { socket.close(); reject(new ConsultClientError('CONNECT_TIMEOUT', '认证超时')); }, this.options.timeoutMs ?? 20_000);
      socket.addEventListener('open', () => { if (socket === this.socket) socket.send(JSON.stringify({ type: 'auth', ticket: ticket.ticket })); });
      socket.addEventListener('message', message => {
        if (socket !== this.socket || this.stopped) return;
        let event: ConsultEvent;
        try { event = JSON.parse(String(message.data)); }
        catch { this.emit({ type: 'error', code: 'INVALID_FRAME', message: '服务端返回了无效消息' }); socket.close(); return; }
        if (!event || typeof event.type !== 'string') { socket.close(); return; }
        if (event.type === 'authenticated') {
          if ((event as ConsultEvent & { protocolVersion?: string }).protocolVersion !== '1.0') {
            clearTimeout(timer); this.stopped = true; socket.close(); reject(new ConsultClientError('INCOMPATIBLE_PROTOCOL', '协议版本不兼容')); return;
          }
          authenticated = true; clearTimeout(timer); this.connectedAt = Date.now();
          this.startHeartbeat(); this.sendResume(); resolve(); this.emit({ type: 'connection', status: 'connected' });
        } else if (!authenticated) {
          if (event.type === 'error') { clearTimeout(timer); this.stopped = true; socket.close(); reject(new ConsultClientError(event.code ?? 'AUTH_FAILED', '连接认证失败')); }
        } else this.receive(event);
      });
      socket.addEventListener('error', () => { /* close handles reconnect; native error events can include implementation details. */ });
      socket.addEventListener('close', close => {
        clearTimeout(timer);
        if (socket !== this.socket || generation !== this.generation) return;
        this.socket = undefined; clearInterval(this.heartbeat);
        this.failPending(new ConsultClientError('SEND_STATUS_UNKNOWN', '连接中断，正在恢复观察；不会重发问题'));
        if (!authenticated) reject(new ConsultClientError('CONNECT_FAILED', 'WSS 连接或认证失败'));
        this.emit({ type: 'connection', status: 'disconnected' });
        if (close.code === 1008) { this.stopped = true; this.emit({ type: 'error', code: 'AUTH_REQUIRED', message: '连接已被拒绝，请核对身份后新建客户端' }); return; }
        if (authenticated) {
          if (Date.now() - this.connectedAt >= 30_000) this.reconnect = 0;
          this.scheduleReconnect();
        }
      });
    });
  }
  private receive(event: ConsultEvent): void {
    if (event.type === 'pong') { this.lastPong = Date.now(); return; }
    if (event.type === 'accepted' || event.type === 'consult.created') {
      if (!event.consultationId || !event.requestId) return;
      this.checkpoint = { consultationId: event.consultationId, requestId: event.requestId, afterSeq: this.checkpoint?.afterSeq ?? 0, epoch: this.checkpoint?.epoch };
      const waiter = this.pending.get(event.requestId);
      if (waiter) { clearTimeout(waiter.timer); this.pending.delete(event.requestId); waiter.resolve({ consultationId: event.consultationId, requestId: event.requestId, title: event.title }); }
      this.save();
    }
    if (event.type === 'consult.ready' && this.checkpoint && event.epoch && event.epoch !== this.checkpoint.epoch) {
      this.checkpoint.afterSeq = 0; this.checkpoint.epoch = event.epoch;
    }
    if (event.seq && this.checkpoint) {
      if (event.seq <= this.checkpoint.afterSeq) return;
      this.checkpoint.afterSeq = event.seq; this.save();
    }
    this.emit(event);
    if (event.type === 'error' && event.requestId) {
      const waiter = this.pending.get(event.requestId);
      if (waiter) { clearTimeout(waiter.timer); this.pending.delete(event.requestId); waiter.reject(new ConsultClientError(event.code ?? 'REQUEST_FAILED', event.message ?? '请求失败')); }
    }
    if (event.type === 'consult.ready' && event.historyRequired) {
      void this.history().then(page => this.emit({ type: 'history', ...page })).catch(() => this.emit({ type: 'error', code: 'HISTORY_UNAVAILABLE', message: '历史读取失败，可手动重试' }));
    }
  }
  private sendResume(): void {
    if (this.checkpoint) this.send({ type: 'consult.resume', consultationId: this.checkpoint.consultationId,
      requestId: this.checkpoint.requestId, afterSeq: this.checkpoint.afterSeq });
  }
  private scheduleReconnect(): void {
    if (this.stopped || this.reconnect >= (this.options.reconnectAttempts ?? 5)) return;
    const delay = Math.min(15_000, 500 * 2 ** this.reconnect++) + Math.floor(Math.random() * 200);
    this.reconnectTimer = setTimeout(() => { void this.connect().catch(error => {
      if (error instanceof ConsultClientError && ['HTTP_401', 'HTTP_403', 'HTTP_503'].includes(error.code)) this.stopped = true;
      if (!this.socket) this.scheduleReconnect();
    }); }, delay);
  }
  private startHeartbeat(): void {
    clearInterval(this.heartbeat); this.lastPong = Date.now();
    this.heartbeat = setInterval(() => {
      if (Date.now() - this.lastPong > 65_000) { this.socket?.close(); return; }
      if (this.socket?.readyState === 1) this.send({ type: 'ping' });
    }, 20_000);
  }
  private send(value: unknown): void {
    if (this.socket?.readyState !== 1) throw new ConsultClientError('NOT_CONNECTED', '连接尚未就绪');
    this.socket.send(JSON.stringify(value));
  }
  private async http<T>(path: string, init: RequestInit): Promise<T> {
    const token = await this.options.getAccessToken();
    if (!token) throw new ConsultClientError('AUTH_REQUIRED', '需要当前用户的 Forge 授权');
    const response = await (this.options.fetch ?? fetch)(`${this.origin}/api/fore-consult/client${path}`,
      { ...init, credentials: 'omit', cache: 'no-store', redirect: 'error',
        headers: { ...init.headers, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000) });
    if (!response.ok) throw new ConsultClientError(`HTTP_${response.status}`, `Forge 请求失败（HTTP ${response.status}）`);
    return response.json() as Promise<T>;
  }
  private requireConsultation(): string {
    if (!this.checkpoint) throw new ConsultClientError('NO_CONSULTATION', '请先创建或恢复咨询');
    return this.checkpoint.consultationId;
  }
  private save(): void {
    if (this.checkpoint) { try { this.options.onCheckpoint?.({ ...this.checkpoint }); } catch (error) { this.options.onListenerError?.(error); } }
  }
  private emit(event: ConsultEvent): void {
    for (const listener of this.listeners) { try { listener(event); } catch (error) { this.options.onListenerError?.(error); } }
  }
  private failPending(error: Error): void {
    for (const waiter of this.pending.values()) { clearTimeout(waiter.timer); waiter.reject(error); }
    this.pending.clear();
  }
}
