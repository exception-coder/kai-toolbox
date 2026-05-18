import type { EntryGeo } from '../types'

/**
 * 尽力而为地拿一次浏览器地理位置。
 * 失败 / 超时 / 用户拒绝 / 浏览器不支持 → 一律返回 null，永不 throw。
 * 默认最多等待 4 秒，避免阻塞「随手记一条」的主流程。
 */
export function tryGetGeo(timeoutMs = 4000): Promise<EntryGeo | null> {
  return new Promise<EntryGeo | null>(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    let settled = false
    const finish = (val: EntryGeo | null) => {
      if (settled) return
      settled = true
      resolve(val)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    try {
      navigator.geolocation.getCurrentPosition(
        pos => {
          clearTimeout(timer)
          finish({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            capturedAt: Date.now(),
          })
        },
        () => {
          clearTimeout(timer)
          finish(null)
        },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: timeoutMs },
      )
    } catch {
      clearTimeout(timer)
      finish(null)
    }
  })
}

export function formatGeoShort(geo: EntryGeo): string {
  const lat = geo.latitude.toFixed(5)
  const lng = geo.longitude.toFixed(5)
  const acc = Math.round(geo.accuracy)
  return `${lat}, ${lng} (±${acc}m)`
}
