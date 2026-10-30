export interface ConsultEvent {
  type: 'authenticated' | 'accepted' | 'consult.created' | 'consult.ready' | 'send.accepted'
    | 'answer.delta' | 'answer.snapshot' | 'completed' | 'error' | 'status' | 'pong'
    | 'connection' | 'history';
  consultationId?: string;
  requestId?: string;
  seq?: number;
  epoch?: string;
  text?: string;
  code?: string;
  message?: string;
  terminal?: boolean;
  status?: string;
  title?: string;
  stopReason?: string;
  turnId?: string;
  historyRequired?: boolean;
  items?: HistoryMessage[];
  historyGap?: string | null;
}
export interface AskInput {
  /** Persist before sending; retry an uncertain request with the same ID and exactly the same input. */
  requestId: string;
  consultationId?: string;
  question: string;
  attachmentIds?: string[];
}
export interface Receipt { requestId: string; consultationId: string; title?: string }
export interface HistoryMessage { id: string; role: 'user' | 'assistant'; text: string }
export interface HistoryPage { items: HistoryMessage[]; nextBefore: number | null; historyGap: string | null }
export interface UploadedAttachment { id: string; name: string; mime: string; size: number }
export interface ClientCheckpoint { consultationId: string; requestId?: string; afterSeq: number; epoch?: string }
export interface ConsultClientOptions {
  /** Origin only. HTTPS required except loopback development. */
  baseUrl: string;
  /** Obtain the actual user's Forge access token; never place a shared secret in browser code. */
  getAccessToken: () => string | Promise<string>;
  fetch?: typeof globalThis.fetch;
  webSocketFactory?: (url: string) => WebSocket;
  onCheckpoint?: (checkpoint: ClientCheckpoint) => void;
  checkpoint?: ClientCheckpoint;
  reconnectAttempts?: number;
  /** Connection/ACK timeout; a timeout never means the business input was not sent. */
  timeoutMs?: number;
  onListenerError?: (error: unknown) => void;
}
