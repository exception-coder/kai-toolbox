import type { DeviceKind, DeviceProfile } from '../types'

const STORAGE_KEY = 'lan-share.deviceKind'

const VALID: ReadonlySet<DeviceKind> = new Set<DeviceKind>([
  'iphone',
  'ipad',
  'android-phone',
  'android-tablet',
  'windows',
  'mac',
  'linux',
  'unknown',
])

export const ALL_DEVICE_KINDS: DeviceKind[] = [
  'iphone',
  'ipad',
  'android-phone',
  'android-tablet',
  'windows',
  'mac',
  'linux',
  'unknown',
]

interface UAData {
  platform?: string
  mobile?: boolean
}

export function detectDeviceKind(): DeviceKind {
  if (typeof navigator === 'undefined') return 'unknown'

  const ua = navigator.userAgent || ''
  const platform = (navigator.platform || '').toLowerCase()
  const uaData = (navigator as Navigator & { userAgentData?: UAData }).userAgentData
  const uaPlatform = (uaData?.platform || '').toLowerCase()
  const isMobile = uaData?.mobile ?? /Mobi|Android/i.test(ua)
  const maxTouch = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0

  // iOS Phone / iPod
  if (/iPhone|iPod/.test(ua)) return 'iphone'

  // iPad: 直接命中 + iPadOS 13+ 伪装成 Mac 时通过 maxTouchPoints 兜底
  if (/iPad/.test(ua)) return 'ipad'
  if ((uaPlatform === 'macos' || /Macintosh/.test(ua)) && maxTouch > 1) return 'ipad'

  // Android
  if (/Android/.test(ua)) {
    return isMobile ? 'android-phone' : 'android-tablet'
  }

  // Desktop
  if (uaPlatform.includes('windows') || platform.includes('win')) return 'windows'
  if (uaPlatform === 'macos' || /Mac OS X|Macintosh/.test(ua)) return 'mac'
  if (uaPlatform.includes('linux') || platform.includes('linux') || /X11|Linux/.test(ua)) return 'linux'

  return 'unknown'
}

export function getOverride(): DeviceKind | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(STORAGE_KEY)
    if (v && VALID.has(v as DeviceKind)) return v as DeviceKind
    if (v) window.localStorage.removeItem(STORAGE_KEY)
    return null
  } catch {
    return null
  }
}

export function setOverride(kind: DeviceKind | null): void {
  if (typeof window === 'undefined') return
  try {
    if (kind === null) window.localStorage.removeItem(STORAGE_KEY)
    else window.localStorage.setItem(STORAGE_KEY, kind)
  } catch {
    // ignore quota / privacy errors
  }
}

export function getDeviceProfile(): DeviceProfile {
  return { kind: getOverride() ?? detectDeviceKind() }
}

export function deviceKindLabel(kind: DeviceKind): string {
  switch (kind) {
    case 'iphone': return 'iPhone'
    case 'ipad': return 'iPad'
    case 'android-phone': return 'Android 手机'
    case 'android-tablet': return 'Android 平板'
    case 'windows': return 'Windows 电脑'
    case 'mac': return 'Mac 电脑'
    case 'linux': return 'Linux 电脑'
    case 'unknown': return '未知设备'
  }
}
