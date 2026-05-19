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

/**
 * 宽容 JSON 解析：先剥掉后端附加的「[已截断 · 原始 N 字符]」尾标再 parse；
 * 若仍失败（说明截断点掉在了字符串/对象内部），用括号栈做一次"切到最后一个完整 element 处补尾闭合"的修复。
 * 这样即使响应被截断，PathPicker 也能基于前面完整的部分让用户选 path。
 */
export function tryParseLenient(
  raw: string,
): { ok: true; data: unknown; truncated: boolean } | { ok: false; err: string } {
  if (raw == null || raw === '') return { ok: false, err: '响应体为空' }
  // 1) 剥后端的 "[已截断 · ...]" 尾巴（不一定有）
  const noMarker = raw.replace(/\n?\[已截断[^\]]*?\]\s*$/, '')
  const stripped = noMarker !== raw
  try { return { ok: true, data: JSON.parse(noMarker), truncated: stripped } } catch { /* fallthrough */ }
  // 2) 真截断了——修复后再 parse
  const repaired = repairTruncatedJson(noMarker)
  if (repaired !== null) {
    try { return { ok: true, data: JSON.parse(repaired), truncated: true } } catch { /* still bad */ }
  }
  return { ok: false, err: '响应被截断，自动修复未成功' }
}

/**
 * 修复一段不完整的 JSON。
 * 策略：只在「刚闭合完一个子树」的位置（} 或 ] 的下一格）切——这是 100% 安全的截断点。
 * 然后用剩余 stack 给外层补 `}` / `]`。
 *
 * 例：`{"a":1,"list":[{"x":1},{"x":2},{"x":3,"y":` →
 *     找到最后一个安全切点 `{"x":2}` 后那个位置 → 截取 `{"a":1,"list":[{"x":1},{"x":2}` → 补 `]}` → 合法
 */
function repairTruncatedJson(s: string): string | null {
  let inString = false
  let escape = false
  const stack: ('{' | '[')[] = []
  /** 最后一个"刚 pop 完"的 i+1 —— 截到这里前面都是平衡完整的（除最外层栈中未闭合） */
  let safeEnd = -1

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (escape) { escape = false; continue }
    if (inString) {
      if (c === '\\') { escape = true; continue }
      if (c === '"') inString = false
      continue
    }
    if (c === '"') { inString = true; continue }
    if (c === '{' || c === '[') stack.push(c as '{' | '[')
    else if (c === '}' || c === ']') {
      stack.pop()
      safeEnd = i + 1
    }
  }

  if (safeEnd < 0) return null

  // 取到最后一个完整子树的右括号后，重新扫一遍算出此时还剩多少未闭合的外层 stack
  const prefix = s.slice(0, safeEnd)
  const finalStack: string[] = []
  let inStr = false, esc = false
  for (let i = 0; i < prefix.length; i++) {
    const c = prefix[i]
    if (esc) { esc = false; continue }
    if (inStr) {
      if (c === '\\') { esc = true; continue }
      if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; continue }
    if (c === '{' || c === '[') finalStack.push(c)
    else if (c === '}' || c === ']') finalStack.pop()
  }
  let result = prefix
  for (let i = finalStack.length - 1; i >= 0; i--) {
    result += finalStack[i] === '{' ? '}' : ']'
  }
  return result
}
