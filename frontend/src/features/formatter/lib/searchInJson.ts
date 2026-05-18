// 在已 parse 的 JSON 树上做子串匹配。
// 主线程同步执行；2 MB JSON ~ 50k 节点 ~ 数十毫秒，250ms debounce 后体验流畅。
// 后续若要支持 > 50 MB 输入再搬到 worker，本接口签名稳定不变。

import { PATH_SEP, pathOf } from './jsonToFlow'

export type SearchMode = 'both' | 'key' | 'value'

export interface SearchMatch {
  /** 匹配项的完整 path id（用 PATH_SEP 连接，与 jsonToFlow / json-worker 一致）。 */
  path: string
  /** 命中的是 key 名还是 value 内容；数组下标恒为 value 端命中。 */
  kind: 'key' | 'value'
  /** UI 列表里的预览片段；80 字符上限，超出截断。 */
  preview: string
}

const PREVIEW_MAX = 80
/** 匹配数上限，超出则截断（防御过宽搜索如单字符）。 */
export const SEARCH_MAX_RESULTS = 5000

function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
  return v !== null && typeof v === 'object'
}

function previewOf(s: string): string {
  if (s.length <= PREVIEW_MAX) return s
  return s.slice(0, PREVIEW_MAX - 1) + '…'
}

/**
 * 递归遍历 root，把所有 key/value 子串匹配的位置收集为 SearchMatch[]。
 * 命中 SEARCH_MAX_RESULTS 即停。
 */
export function searchInJson(root: unknown, query: string, mode: SearchMode = 'both'): SearchMatch[] {
  const out: SearchMatch[] = []
  const q = query.trim()
  if (!q) return out
  const qLower = q.toLowerCase()

  function walk(value: unknown, path: string): void {
    if (out.length >= SEARCH_MAX_RESULTS) return
    if (!isContainer(value)) return
    const isArr = Array.isArray(value)
    const entries: Array<[string, unknown]> = isArr
      ? (value as unknown[]).map((v, i) => [String(i), v])
      : Object.entries(value)
    for (const [k, v] of entries) {
      if (out.length >= SEARCH_MAX_RESULTS) return
      const childPath = pathOf(path, k)
      // key 匹配仅对 object 字段有意义（数组下标恒为数字字符串，对用户搜索无价值）
      if ((mode === 'both' || mode === 'key') && !isArr && k.toLowerCase().includes(qLower)) {
        out.push({ path: childPath, kind: 'key', preview: previewOf(k) })
      }
      if (isContainer(v)) {
        walk(v, childPath)
      } else if (mode === 'both' || mode === 'value') {
        const valStr = v === null ? 'null' : String(v)
        if (valStr.toLowerCase().includes(qLower)) {
          out.push({ path: childPath, kind: 'value', preview: previewOf(valStr) })
        }
      }
    }
  }

  walk(root, 'root')
  return out
}

/**
 * 把 path id 拆出每一级 ancestor 加入 set。
 * 例如 'root\x1fdata\x1f0\x1ftitle' → 加入 'root', 'root\x1fdata', 'root\x1fdata\x1f0'
 * （末段是 row 的 key，无需加；要展开的是它的父节点链）。
 */
export function ancestorPathsOf(matchPath: string): string[] {
  const segments = matchPath.split(PATH_SEP)
  const out: string[] = []
  let acc = segments[0]
  out.push(acc)
  for (let i = 1; i < segments.length - 1; i++) {
    acc = acc + PATH_SEP + segments[i]
    out.push(acc)
  }
  return out
}

/** 取一个 path 的父 path（去掉最后一段 key）。 */
export function parentPathOf(matchPath: string): string {
  const idx = matchPath.lastIndexOf(PATH_SEP)
  return idx < 0 ? matchPath : matchPath.slice(0, idx)
}
