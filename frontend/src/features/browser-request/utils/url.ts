/**
 * URL 拆 query / 拼回工具。
 *
 * 关键点：
 *   - query 顺序保留（用 array 而不是 Map）
 *   - **变量占位符 `{{name}}` 不参与 encodeURIComponent** —— 拼回时把它当字面值保留
 *     原因：后端 TemplateRenderer 看到的是 `{{name}}`，渲染前不能被 `%7B%7Bname%7D%7D` 替换
 */

export interface QueryParam {
  key: string
  value: string
}

export interface ParsedUrl {
  /** 不含 query 的 URL 部分（含 origin + path） */
  base: string
  query: QueryParam[]
  /** 原始 hash（#xxx）部分，拼回时保留 */
  hash: string
}

export function parseUrl(url: string): ParsedUrl {
  if (!url) return { base: '', query: [], hash: '' }
  let work = url
  let hash = ''
  const hashIdx = work.indexOf('#')
  if (hashIdx >= 0) {
    hash = work.slice(hashIdx)
    work = work.slice(0, hashIdx)
  }
  const qIdx = work.indexOf('?')
  if (qIdx < 0) return { base: work, query: [], hash }
  const base = work.slice(0, qIdx)
  const qs = work.slice(qIdx + 1)
  const query: QueryParam[] = []
  if (qs) {
    for (const pair of qs.split('&')) {
      if (!pair) continue
      const eq = pair.indexOf('=')
      if (eq < 0) {
        query.push({ key: safeDecode(pair), value: '' })
      } else {
        query.push({
          key: safeDecode(pair.slice(0, eq)),
          value: safeDecode(pair.slice(eq + 1)),
        })
      }
    }
  }
  return { base, query, hash }
}

export function serializeUrl(parsed: ParsedUrl): string {
  let url = parsed.base
  if (parsed.query.length > 0) {
    const qs = parsed.query
      .map(p => `${encodeKeepPlaceholders(p.key)}=${encodeKeepPlaceholders(p.value)}`)
      .join('&')
    url += '?' + qs
  }
  if (parsed.hash) url += parsed.hash
  return url
}

/**
 * encodeURIComponent 的变体：遇到 `{{name}}` 片段时整段保留，不做 URL 编码。
 * 保证后端模板渲染时看到的占位符是字面 `{{name}}` 而非 `%7B%7Bname%7D%7D`。
 */
function encodeKeepPlaceholders(s: string): string {
  if (!s) return ''
  const parts = s.split(/(\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\})/g)
  return parts.map(p => /^\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}$/.test(p)
    ? p
    : encodeURIComponent(p)).join('')
}

/** 解码失败时返回原值，避免 URL 中含非法 % 序列时整个挂掉。 */
function safeDecode(s: string): string {
  try { return decodeURIComponent(s.replace(/\+/g, ' ')) }
  catch { return s }
}

/** 判断字符串是否是单变量引用，如 `{{slug}}` —— 用于 UI 上判断"该字段已绑变量"。 */
export function isVarRef(s: string): boolean {
  return /^\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}$/.test(s)
}
