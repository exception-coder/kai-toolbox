import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { callAppServer } from './codexAppServer.js'

const ENDPOINT = 'wss://chatgpt.com/backend-api/dictation/stream?dictation_surface=codex&client_type=desktop'
export const MAX_DICTATION_BYTES = 16000 * 2 * 120
type AuthRequest = (method: string, params: Record<string, unknown>, home?: string) => Promise<Record<string, unknown>>

/** Native desktop dictation is independent of thread/realtime and never starts a code turn. */
export async function codexDictationAuth(home?: string, request: AuthRequest = callAppServer) {
  const auth = await request('getAuthStatus', { includeToken: true, refreshToken: false }, home)
    .catch(() => { throw new Error('无法读取当前会话的 Codex 登录状态，请检查账号后重试') })
  if (auth.authMethod !== 'chatgpt' || typeof auth.authToken !== 'string' || !auth.authToken) {
    throw new Error('Codex 听写需要当前会话使用 ChatGPT 登录，请检查该会话的 Codex 账号')
  }
  let account: unknown
  try {
    const claims = JSON.parse(Buffer.from(auth.authToken.split('.')[1] ?? '', 'base64url').toString())
    account = claims['https://api.openai.com/auth']?.chatgpt_account_id
  } catch { /* Invalid credentials are rejected without exposing their contents. */ }
  if (typeof account !== 'string' || !account) throw new Error('Codex 账号信息不完整，请重新登录该账号')
  return { token: auth.authToken, account }
}

export function validateDictationAudio(audio: string): Buffer {
  if (!audio || audio.length % 4 || audio.length > Math.ceil(MAX_DICTATION_BYTES / 3) * 4) {
    throw new Error('听写音频无效或超过 120 秒，请分段录音')
  }
  const pcm = Buffer.from(audio, 'base64')
  if (!pcm.length || pcm.length % 2 || pcm.length > MAX_DICTATION_BYTES || pcm.toString('base64') !== audio) {
    throw new Error('听写音频格式无效')
  }
  return pcm
}

/** Credential-bearing sockets stay in Sidecar; only final text crosses the Java/browser boundary. */
export function transcribeCodexPcm(pcm: Buffer, auth: { token: string; account: string },
  connect = () => new WebSocket(ENDPOINT, ['chatgpt-dictation', 'codex-desktop'], {
    headers: { Authorization: `Bearer ${auth.token}`, 'ChatGPT-Account-Id': auth.account,
      originator: 'codex_desktop', 'User-Agent': 'codex_desktop/0.162.1 (Windows NT 10.0; Win64; x64)' },
    handshakeTimeout: 10_000, followRedirects: false, maxPayload: 1024 * 1024,
  })): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect()
    const utterances = new Map<string, { revision: number; text: string }>()
    let done = false
    let started = false
    let closing = false
    let textChars = 0
    const timer = setTimeout(() => finish(new Error('Codex 听写超时，请稍后重新录音')), 45_000)
    function finish(error?: Error) {
      if (done) return
      done = true
      clearTimeout(timer)
      socket.removeAllListeners()
      // terminate may emit an asynchronous error while the handshake is pending.
      socket.on('error', () => {})
      socket.terminate()
      const text = [...utterances.values()].map(item => item.text).filter(Boolean).join(' ').trim()
      if (error) reject(error)
      else if (!text) reject(new Error('没有识别到语音，请重新录音'))
      else resolve(text)
    }
    socket.on('open', () => socket.send(JSON.stringify({ type: 'session.start',
      dictation_session_id: randomUUID(), attempt_id: randomUUID(), config: {
        input_audio_format: 'pcm16', sample_rate_hz: 16000, num_channels: 1,
        max_buffer_size_bytes: 4194304, max_utterance_duration_ms: 30000, session_ttl_ms: 300000,
        provider_mode: 'streaming_sse', transcript_delivery_mode: 'final_only',
        vad: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500 },
      } })))
    socket.on('message', (raw, binary) => {
      if (done) return
      try {
        const payload = Buffer.isBuffer(raw) ? raw : Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw)
        if (binary || payload.length > 1024 * 1024) throw new Error()
        const event = JSON.parse(payload.toString())
        if (event.type === 'session.started' && !started) {
          started = true
          for (let offset = 0; offset < pcm.length; offset += 32000) {
            socket.send(JSON.stringify({ type: 'audio.append', audio: pcm.subarray(offset, offset + 32000).toString('base64') }))
          }
          closing = true
          socket.send(JSON.stringify({ type: 'session.close' }))
        } else if (event.type === 'speech.started' && typeof event.utterance_id === 'string') {
          if (!utterances.has(event.utterance_id) && utterances.size >= 1000) throw new Error()
          if (!utterances.has(event.utterance_id)) utterances.set(event.utterance_id, { revision: -1, text: '' })
        } else if (event.type === 'transcript.final') {
          if (typeof event.utterance_id !== 'string' || typeof event.text !== 'string'
            || !Number.isInteger(event.revision) || event.text.length > 100000 || utterances.size > 1000) throw new Error()
          const previous = utterances.get(event.utterance_id)
          if (!previous || event.revision >= previous.revision) {
            textChars += event.text.length - (previous?.text.length ?? 0)
            if (textChars > 100000) throw new Error()
            utterances.set(event.utterance_id, { revision: event.revision, text: event.text })
          }
        } else if (event.type === 'session.updated' && event.session?.status === 'closed') {
          if (!closing) throw new Error()
          finish()
        } else if (event.type === 'transcript.failed' || event.type === 'session.error'
          || event.type === 'session.stop_requested') {
          finish(new Error('Codex 听写服务未能完成识别，请稍后重新录音'))
        }
      } catch { finish(new Error('Codex 听写响应无效，请稍后重试')) }
    })
    socket.on('unexpected-response', (_request, response) => {
      response.resume()
      finish(new Error(response.statusCode === 401 || response.statusCode === 403
        ? '当前 Codex 账号无法访问听写服务，请检查登录状态和账号权限'
        : 'Codex 听写服务暂不可用，请稍后重试'))
    })
    socket.on('error', () => finish(new Error('无法连接 Codex 听写服务，请检查网络后重试')))
    socket.on('close', () => finish(new Error('Codex 听写连接提前断开，请重新录音')))
  })
}

let active = 0
export async function handleCodexDictation(home: string | undefined, audio?: string) {
  if (active >= 4) return { error: '听写请求较多，请稍后重试' }
  active++
  try {
    const pcm = audio === undefined ? undefined : validateDictationAudio(audio)
    const auth = await codexDictationAuth(home)
    return pcm ? { text: await transcribeCodexPcm(pcm, auth) } : { available: true }
  } catch (error) {
    // RPC diagnostics may contain local paths; never relay arbitrary upstream errors or credentials.
    const message = error instanceof Error ? error.message : ''
    return { available: false, error: /^(Codex |当前 Codex |没有识别到语音|听写音频|无法连接 Codex )/.test(message)
      ? message : '无法读取当前会话的 Codex 登录状态，请检查账号后重试' }
  } finally { active-- }
}
