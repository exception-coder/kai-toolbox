const KEY_DEVICE_ID = 'kai-toolbox.lan-share.deviceId'
const KEY_NICKNAME = 'kai-toolbox.lan-share.nickname'

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // RFC 4122 v4 兜底
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}

export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(KEY_DEVICE_ID)
  if (!id) {
    id = uuidv4()
    localStorage.setItem(KEY_DEVICE_ID, id)
  }
  return id
}

export function getNickname(): string {
  return localStorage.getItem(KEY_NICKNAME) ?? defaultNickname()
}

export function setNickname(name: string): void {
  const trimmed = name.trim().slice(0, 32)
  if (trimmed) localStorage.setItem(KEY_NICKNAME, trimmed)
}

export function defaultNickname(): string {
  const ua = navigator.userAgent
  const browser =
    /Edg\//.test(ua) ? 'Edge' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Firefox\//.test(ua) ? 'Firefox' :
    /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const os =
    /Windows/.test(ua) ? 'Windows' :
    /Macintosh/.test(ua) ? 'macOS' :
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad/.test(ua) ? 'iOS' :
    /Linux/.test(ua) ? 'Linux' : 'Device'
  return `${browser} on ${os}`
}
