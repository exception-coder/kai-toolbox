import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 2)} ${sizes[i]}`
}

export function formatNumber(n: number): string {
  return n.toLocaleString()
}

export function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleString()
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s} 秒`
  const m = Math.floor(s / 60)
  const rs = s % 60
  if (m < 60) return `${m} 分 ${rs} 秒`
  const h = Math.floor(m / 60)
  const rm = m % 60
  return `${h} 时 ${rm} 分`
}
