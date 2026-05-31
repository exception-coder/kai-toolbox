// 前端版子集 JSONPath：与后端 SimpleJsonPath 保持兼容子集。
// 用于编排时把"用户在响应树上点的字段路径"生成 JSONPath，并能在前端做预览求值。

export type PathSeg = string | number

/** ['data', 'items', 0, 'title'] → "$.data.items[0].title"；非法标识符回退到 ["xxx"] 形式 */
export function fromTreePath(path: PathSeg[]): string {
  let out = '$'
  for (const seg of path) {
    if (typeof seg === 'number') {
      out += `[${seg}]`
    } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(seg)) {
      out += `.${seg}`
    } else {
      out += `[${JSON.stringify(seg)}]`
    }
  }
  return out
}

/** 同 fromTreePath，但把所有数字下标改成 [*] 通配——抽取数组中所有项对应的字段。 */
export function fromTreePathWildcard(path: PathSeg[]): string {
  let out = '$'
  for (const seg of path) {
    if (typeof seg === 'number') {
      out += `[*]`
    } else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(seg)) {
      out += `.${seg}`
    } else {
      out += `[${JSON.stringify(seg)}]`
    }
  }
  return out
}

/** 在 JSON 值上沿 path 走，找不到返回 undefined。 */
export function getByPath(root: unknown, path: PathSeg[]): unknown {
  let cur: unknown = root
  for (const seg of path) {
    if (cur == null) return undefined
    if (typeof seg === 'number') {
      if (!Array.isArray(cur)) return undefined
      cur = cur[seg]
    } else {
      if (typeof cur !== 'object') return undefined
      cur = (cur as Record<string, unknown>)[seg]
    }
  }
  return cur
}

/**
 * 简化求值器：仅支持 $.a.b[0].c / $.a[*].b 形式（与后端 SimpleJsonPath 子集一致）。
 * 用于编排时本地预览抽取结果。
 */
export function evalSimple(json: string, path: string): unknown {
  try {
    const root = JSON.parse(json)
    return evalNode(root, path)
  } catch {
    return undefined
  }
}

function evalNode(root: unknown, path: string): unknown {
  const trimmed = path.trim()
  if (!trimmed || trimmed === '$') return root
  if (!trimmed.startsWith('$')) return undefined
  let currents: unknown[] = [root]
  let i = 1
  while (i < trimmed.length) {
    const ch = trimmed[i]
    if (ch === '.') {
      let j = i + 1
      while (j < trimmed.length && /[A-Za-z0-9_$]/.test(trimmed[j])) j++
      if (j === i + 1) return undefined
      const key = trimmed.slice(i + 1, j)
      currents = currents.flatMap(c =>
        c && typeof c === 'object' && !Array.isArray(c)
          ? [(c as Record<string, unknown>)[key]]
          : []
      )
      i = j
    } else if (ch === '[') {
      const close = trimmed.indexOf(']', i)
      if (close < 0) return undefined
      const inside = trimmed.slice(i + 1, close)
      if (inside === '*') {
        currents = currents.flatMap(c => Array.isArray(c) ? c : [])
      } else if (/^\d+$/.test(inside)) {
        const idx = Number(inside)
        currents = currents.flatMap(c =>
          Array.isArray(c) && idx < c.length ? [c[idx]] : []
        )
      } else if (inside.startsWith('"') && inside.endsWith('"')) {
        const key = inside.slice(1, -1)
        currents = currents.flatMap(c =>
          c && typeof c === 'object' && !Array.isArray(c)
            ? [(c as Record<string, unknown>)[key]]
            : []
        )
      } else {
        return undefined
      }
      i = close + 1
    } else {
      return undefined
    }
  }
  return currents.length === 1 ? currents[0] : currents
}
