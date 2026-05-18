// 模块内小工具：时长格式化、时间轴分组键、语音 mime 协商

export function formatDurationShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0:00'
  const totalSec = Math.round(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * 把时间戳归类为「今天 / 昨天 / YYYY-MM-DD」分组键，便于时间轴聚合显示。
 * 完全用本地时区，跨午夜自动滚动到新组。
 */
export function groupKeyOf(epochMs: number): string {
  const d = new Date(epochMs)
  const today = startOfDay(new Date())
  const target = startOfDay(d)
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000)
  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
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

export function formatHM(epochMs: number): string {
  const d = new Date(epochMs)
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}
