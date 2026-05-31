export function formatBytes(bytes: number): string {
  if (bytes < 0 || !Number.isFinite(bytes)) return '未知'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let n = bytes / 1024
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)} ${units[i]}`
}

export function formatRate(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return '—'
  return `${formatBytes(bytesPerSecond)}/s`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0 || !Number.isFinite(seconds)) return '—'
  if (seconds < 60) return `${Math.ceil(seconds)} 秒`
  const mins = Math.floor(seconds / 60)
  const secs = Math.ceil(seconds - mins * 60)
  if (mins < 60) return `${mins} 分 ${secs} 秒`
  const hours = Math.floor(mins / 60)
  return `${hours} 小时 ${mins - hours * 60} 分`
}
