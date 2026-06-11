// 录音相关小工具：时长格式化 + 浏览器录音 mime 协商

export function formatDurationShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * 浏览器对 MediaRecorder 支持的 mime 不一致，按偏好顺序协商一个最优可用 mime。
 * 都不支持则返回空串，调用方应回退到默认（不传 mime）。
 */
export function pickVoiceMime(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/mpeg',
  ]
  if (typeof MediaRecorder === 'undefined') return ''
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported?.(mime)) return mime
  }
  return ''
}
