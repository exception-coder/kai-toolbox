// 与后端 TaskService.countOccurrences / resolveFieldText 等价的前端校验

import type { AdhocRequest } from '../types'

export function countOccurrences(text: string, token: string): number {
  if (!text || !token) return 0
  let cnt = 0, from = 0
  while (true) {
    const i = text.indexOf(token, from)
    if (i < 0) return cnt
    cnt++
    from = i + token.length
  }
}

/** 按 field 描述符在 adhoc 中取原文。 */
export function resolveFieldText(field: string, adhoc: AdhocRequest): string | null {
  if (!field) return null
  if (field === 'url') return adhoc.url ?? null
  if (field === 'body') return adhoc.body ?? null
  if (field === 'path') {
    try {
      const u = new URL(adhoc.url ?? '', 'http://x.local')
      return u.pathname
    } catch { return null }
  }
  if (field.startsWith('query.')) {
    const key = field.slice('query.'.length)
    try {
      const u = new URL(adhoc.url ?? '', 'http://x.local')
      return u.searchParams.get(key)
    } catch { return null }
  }
  if (field.startsWith('header.')) {
    const key = field.slice('header.'.length).toLowerCase()
    if (!adhoc.headers) return null
    for (const [k, v] of Object.entries(adhoc.headers)) {
      if (k.toLowerCase() === key) return v
    }
    return null
  }
  return null
}

/** 校验单条 parameterization：token 必须在 field 原文中恰好出现一次。 */
export function validateParameterization(
  field: string,
  token: string,
  adhoc: AdhocRequest,
): { ok: true } | { ok: false; error: string } {
  if (!token) return { ok: false, error: 'token 不能为空' }
  const source = resolveFieldText(field, adhoc)
  if (source == null) return { ok: false, error: `field 「${field}」在此 step 中不存在` }
  const n = countOccurrences(source, token)
  if (n === 0) return { ok: false, error: `token 在 ${field} 中找不到` }
  if (n > 1) return { ok: false, error: `token 在 ${field} 中出现 ${n} 次，请缩小选区或换更独特的片段` }
  return { ok: true }
}
