import type { ControlMessage, FileOffer } from '../types'

export const CHUNK_SIZE = 16 * 1024              // 16KB DataChannel 推荐值
const HIGH_WATER = 16 * 1024 * 1024              // 16MB 上限触发暂停
const LOW_WATER = 1 * 1024 * 1024                // 1MB 阈值恢复

function fileIdToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, '')
  const out = new Uint8Array(16)
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16)
  return out
}

function bytesToFileId(buf: Uint8Array): string {
  const hex = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return bytesToFileId(bytes)
}

function encodeChunk(fileIdBytes: Uint8Array, chunkIdx: number, payload: ArrayBuffer): ArrayBuffer {
  const buf = new ArrayBuffer(20 + payload.byteLength)
  const view = new Uint8Array(buf)
  view.set(fileIdBytes, 0)
  const dv = new DataView(buf)
  dv.setUint32(16, chunkIdx, false)               // BE
  view.set(new Uint8Array(payload), 20)
  return buf
}

function decodeChunk(buf: ArrayBuffer): { fileId: string; chunkIdx: number; payload: Uint8Array } {
  const view = new Uint8Array(buf)
  const fileId = bytesToFileId(view.slice(0, 16))
  const dv = new DataView(buf)
  const chunkIdx = dv.getUint32(16, false)
  const payload = view.slice(20)
  return { fileId, chunkIdx, payload }
}

/**
 * 发起方发送文件流程：
 * 1. 等待 control DC 上的 accept
 * 2. 按 16KB 分片写入 data DC，遇背压暂停
 * 3. 完成后触发 onComplete
 */
export async function sendFile(
  controlDC: RTCDataChannel,
  dataDC: RTCDataChannel,
  file: File,
  callbacks: {
    onAccepted?: (fileId: string) => void
    onProgress?: (fileId: string, sent: number) => void
    onComplete?: (fileId: string) => void
    onRejected?: (fileId: string, reason?: string) => void
    onFailed?: (fileId: string, error: Error) => void
  } = {},
): Promise<void> {
  const fileId = uuidv4()
  const fileIdBytes = fileIdToBytes(fileId)
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1

  // 发 offer
  const offer: ControlMessage = {
    type: 'offer',
    fileId,
    name: file.name,
    size: file.size,
    mime: file.type || undefined,
    totalChunks,
  }
  controlDC.send(JSON.stringify(offer))

  // 等 accept / reject
  const accepted = await new Promise<boolean>((resolve) => {
    const handler = (ev: MessageEvent) => {
      let msg: ControlMessage
      try { msg = JSON.parse(ev.data) } catch { return }
      if (msg.fileId !== fileId) return
      if (msg.type === 'accept') {
        controlDC.removeEventListener('message', handler)
        callbacks.onAccepted?.(fileId)
        resolve(true)
      } else if (msg.type === 'reject') {
        controlDC.removeEventListener('message', handler)
        callbacks.onRejected?.(fileId, msg.reason)
        resolve(false)
      }
    }
    controlDC.addEventListener('message', handler)
  })

  if (!accepted) return

  // 监听 progress / complete
  const watcher = (ev: MessageEvent) => {
    let msg: ControlMessage
    try { msg = JSON.parse(ev.data) } catch { return }
    if (msg.fileId !== fileId) return
    if (msg.type === 'progress') callbacks.onProgress?.(fileId, msg.received)
    if (msg.type === 'complete') {
      controlDC.removeEventListener('message', watcher)
      callbacks.onComplete?.(fileId)
    }
  }
  controlDC.addEventListener('message', watcher)

  // 配置背压
  dataDC.bufferedAmountLowThreshold = LOW_WATER

  try {
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE
      const end = Math.min(start + CHUNK_SIZE, file.size)
      const blob = file.slice(start, end)
      const payload = await blob.arrayBuffer()
      const frame = encodeChunk(fileIdBytes, i, payload)

      if (dataDC.bufferedAmount > HIGH_WATER) {
        await new Promise<void>((resolve) => {
          const onLow = () => {
            dataDC.removeEventListener('bufferedamountlow', onLow)
            resolve()
          }
          dataDC.addEventListener('bufferedamountlow', onLow)
        })
      }
      dataDC.send(frame)
    }
  } catch (e) {
    controlDC.removeEventListener('message', watcher)
    callbacks.onFailed?.(fileId, e as Error)
  }
}

/**
 * 接收端：监听 control + data 双通道，组装 Blob 触发下载。
 */
export function createReceiver(
  controlDC: RTCDataChannel,
  dataDC: RTCDataChannel,
  callbacks: {
    onIncoming: (offer: FileOffer) => Promise<boolean>           // 返回是否接受
    onProgress?: (fileId: string, received: number, total: number) => void
    onComplete?: (fileId: string, blob: Blob, offer: FileOffer) => void
    onError?: (fileId: string, message: string) => void
  },
): { close: () => void } {
  type State = {
    offer: FileOffer
    chunks: (Uint8Array | undefined)[]
    received: number
    receivedChunks: number
  }
  const states = new Map<string, State>()
  let lastProgressReportedAt = 0

  dataDC.binaryType = 'arraybuffer'

  const onControl = async (ev: MessageEvent) => {
    let msg: ControlMessage
    try { msg = JSON.parse(ev.data) } catch { return }
    if (msg.type === 'offer') {
      const offer: FileOffer = msg
      const accept = await callbacks.onIncoming(offer)
      if (accept) {
        states.set(offer.fileId, {
          offer,
          chunks: new Array(offer.totalChunks),
          received: 0,
          receivedChunks: 0,
        })
        controlDC.send(JSON.stringify({ type: 'accept', fileId: offer.fileId } satisfies ControlMessage))
      } else {
        controlDC.send(JSON.stringify({ type: 'reject', fileId: offer.fileId, reason: 'user-declined' } satisfies ControlMessage))
      }
    }
    if (msg.type === 'cancel') {
      states.delete(msg.fileId)
    }
  }

  const onData = (ev: MessageEvent) => {
    if (!(ev.data instanceof ArrayBuffer)) return
    const { fileId, chunkIdx, payload } = decodeChunk(ev.data)
    const state = states.get(fileId)
    if (!state) return
    if (state.chunks[chunkIdx] != null) return
    state.chunks[chunkIdx] = payload
    state.received += payload.byteLength
    state.receivedChunks += 1

    const now = performance.now()
    if (now - lastProgressReportedAt > 200) {
      lastProgressReportedAt = now
      controlDC.send(JSON.stringify({ type: 'progress', fileId, received: state.received } satisfies ControlMessage))
      callbacks.onProgress?.(fileId, state.received, state.offer.size)
    }

    if (state.receivedChunks === state.offer.totalChunks) {
      const parts: BlobPart[] = (state.chunks as Uint8Array[]).map(
        c => c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength) as ArrayBuffer
      )
      const blob = new Blob(parts, { type: state.offer.mime ?? 'application/octet-stream' })
      states.delete(fileId)
      controlDC.send(JSON.stringify({ type: 'complete', fileId } satisfies ControlMessage))
      callbacks.onComplete?.(fileId, blob, state.offer)
    }
  }

  controlDC.addEventListener('message', onControl)
  dataDC.addEventListener('message', onData)

  return {
    close() {
      controlDC.removeEventListener('message', onControl)
      dataDC.removeEventListener('message', onData)
      states.clear()
    },
  }
}

export function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
