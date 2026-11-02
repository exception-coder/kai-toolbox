export const MAX_DICTATION_SECONDS = 120

/** The desktop dictation protocol accepts little-endian signed PCM16, never a media container. */
export function encodePcm16(samples: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(samples.length * 2)
  const view = new DataView(buffer)
  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(index * 2, Math.round(clamped < 0 ? clamped * 32768 : clamped * 32767), true)
  })
  return buffer
}

/** Decode the browser's webm/mp4 recording locally and downmix/resample for native dictation. */
export async function toDictationPcm(audio: Blob): Promise<ArrayBuffer> {
  if (!audio.size || audio.size > 20 * 1024 * 1024) throw new Error('录音为空或过大，请分段录音')
  const context = new AudioContext()
  let decoded: AudioBuffer
  try { decoded = await context.decodeAudioData(await audio.arrayBuffer()) }
  catch { throw new Error('当前浏览器无法转换录音，请使用系统键盘听写或更换浏览器') }
  finally { await context.close().catch(() => {}) }
  if (!decoded.length || decoded.duration > MAX_DICTATION_SECONDS) {
    throw new Error('听写每段最多 120 秒，请分段录音')
  }
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000)
  const source = offline.createBufferSource()
  source.buffer = decoded
  source.connect(offline.destination)
  source.start()
  return encodePcm16((await offline.startRendering()).getChannelData(0))
}
