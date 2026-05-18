/**
 * 极简 JSONPath 求值，必须和后端 {@code SimpleJsonPath.java} 保持一致。
 *
 * 支持：
 *   $                根
 *   $.a.b            对象点取
 *   $.a.b[0]         数组下标
 *   $["with-dash"]   方括号字符串键
 *   $.a[*]           数组通配（隐式扁平一层）
 *   $.a[*].b         数组通配后再点取
 *   $.a[*].b[*]      多层通配——扁平到单层数组
 *
 * 不支持：$..递归 / 过滤器 / 函数。
 */
export function evalJsonPath(obj: unknown, path: string): unknown {
  const trimmed = path.trim()
  if (trimmed === '' || trimmed === '$') return obj
  if (!trimmed.startsWith('$')) return undefined

  let currents: Array<unknown> = [obj]
  let flattenedOnce = false
  let i = 1
  while (i < trimmed.length) {
    const ch = trimmed[i]
    if (ch === '.') {
      let j = i + 1
      while (j < trimmed.length && /[A-Za-z0-9_$]/.test(trimmed[j])) j++
      if (j === i + 1) return undefined
      const key = trimmed.slice(i + 1, j)
      currents = mapField(currents, key, flattenedOnce)
      i = j
    } else if (ch === '[') {
      const close = trimmed.indexOf(']', i)
      if (close < 0) return undefined
      const token = trimmed.slice(i + 1, close).trim()
      if (token === '*') {
        const next: unknown[] = []
        for (const n of currents) {
          if (Array.isArray(n)) for (const child of n) next.push(child)
        }
        currents = next
        flattenedOnce = true
      } else if (/^-?\d+$/.test(token)) {
        const idx = Number(token)
        const next: unknown[] = []
        for (const n of currents) {
          if (Array.isArray(n)) {
            const actual = idx < 0 ? n.length + idx : idx
            if (actual >= 0 && actual < n.length) next.push(n[actual])
            else if (!flattenedOnce) next.push(undefined)
          } else if (!flattenedOnce) {
            next.push(undefined)
          }
        }
        currents = next
      } else if (
        (token.startsWith('"') && token.endsWith('"')) ||
        (token.startsWith("'") && token.endsWith("'"))
      ) {
        const key = token.slice(1, -1)
        currents = mapField(currents, key, flattenedOnce)
      } else {
        return undefined
      }
      i = close + 1
    } else {
      return undefined
    }
  }

  if (!flattenedOnce) {
    return currents.length === 0 ? undefined : currents[0]
  }
  return currents.filter(x => x !== undefined && x !== null)
}

function mapField(currents: unknown[], key: string, flattened: boolean): unknown[] {
  const next: unknown[] = []
  for (const n of currents) {
    if (n == null) {
      if (!flattened) next.push(undefined)
      continue
    }
    const v = (n as Record<string, unknown>)[key]
    if (v !== undefined) next.push(v)
    else if (!flattened) next.push(undefined)
  }
  return next
}

/** 把求值结果归一为字符串以便存入变量池。 */
export function stringifyForVar(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try { return JSON.stringify(value) } catch { return String(value) }
}
