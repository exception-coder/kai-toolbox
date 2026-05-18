/// <reference lib="webworker" />

// JSON 操作 Web Worker：把可能很重的 JSON.parse / JSON.stringify 搬到独立线程，
// 主线程在大文件下不会冻结。失败时把 SyntaxError 中的 position 提取出来给 UI 跳光标。
// 格式化时可选返回「path → 输出文本中位置」索引，给跨视图跳转用。

import { PATH_SEP } from './jsonToFlow'

/** path → 输出文本中位置的索引条目。
 *  数组元素无 key，keyStart/End = -1；其余 keyStart/End 标 JSON 字面量 key 的范围（含引号）。
 *  valueStart/End 标该值的整体范围（含 `{}` / `[]`，或 primitive 自身）。 */
export interface IndexEntry {
  /** path id，用 PATH_SEP 连接，例如 `root\x1fdata\x1f0\x1ftitle`。 */
  path: string
  keyStart: number
  keyEnd: number
  valueStart: number
  valueEnd: number
}

export type WorkerReq =
  | { id: number; op: 'format'; input: string; indent: number | '\t'; withIndex?: boolean }
  | { id: number; op: 'minify'; input: string }
  | { id: number; op: 'escape'; input: string }
  | { id: number; op: 'unescape'; input: string }
  | { id: number; op: 'parse'; input: string }

// ok 变体合并：format/minify/escape/unescape 用 output(+可选 index)，parse 用 root；
// 调用方按自己发的 op 取对应字段。合并而不是判别联合避免在每个调用点都加 cast。
export type WorkerRes =
  | { id: number; ok: true; output?: string; index?: IndexEntry[]; root?: unknown }
  | { id: number; ok: false; error: string; errorPos?: number }

/** 从 SyntaxError.message 提取 `position N`。 */
function extractErrorPos(msg: string): number | undefined {
  const m = /position\s+(\d+)/i.exec(msg)
  return m ? Number.parseInt(m[1], 10) : undefined
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/**
 * 自实现的带位置索引的 JSON 序列化器。
 * 输出文本与 `JSON.stringify(value, null, indent)` 完全一致（同一缩进规则）；
 * 额外构造扁平 index 数组，记录每个 path 在输出中的 key/value 区间。
 *
 * 复杂度：O(N) 时间、O(N) 索引内存（N = JSON 节点数）。
 * 用例：2 MB JSON → ~50k entries，可接受。
 */
function stringifyWithIndex(root: unknown, indent: number | '\t'): { text: string; index: IndexEntry[] } {
  const indentUnit = typeof indent === 'string' ? indent : ' '.repeat(indent)
  const chunks: string[] = []
  let length = 0
  const index: IndexEntry[] = []

  function w(s: string): void {
    chunks.push(s)
    length += s.length
  }

  function emitWithPath(v: unknown, path: string, depth: number): void {
    if (v === null) { w('null'); return }
    if (typeof v === 'boolean') { w(v ? 'true' : 'false'); return }
    if (typeof v === 'number') { w(Number.isFinite(v) ? String(v) : 'null'); return }
    if (typeof v === 'string') { w(JSON.stringify(v)); return }
    if (Array.isArray(v)) {
      if (v.length === 0) { w('[]'); return }
      w('[\n')
      const pad = indentUnit.repeat(depth + 1)
      for (let i = 0; i < v.length; i++) {
        w(pad)
        const valueStart = length
        const childPath = path + PATH_SEP + i
        emitWithPath(v[i], childPath, depth + 1)
        const valueEnd = length
        index.push({ path: childPath, keyStart: -1, keyEnd: -1, valueStart, valueEnd })
        if (i < v.length - 1) w(',')
        w('\n')
      }
      w(indentUnit.repeat(depth) + ']')
      return
    }
    if (isPlainObject(v)) {
      const keys = Object.keys(v)
      if (keys.length === 0) { w('{}'); return }
      w('{\n')
      const pad = indentUnit.repeat(depth + 1)
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]
        w(pad)
        const keyStart = length
        w(JSON.stringify(k))
        const keyEnd = length
        w(': ')
        const valueStart = length
        const childPath = path + PATH_SEP + k
        emitWithPath(v[k], childPath, depth + 1)
        const valueEnd = length
        index.push({ path: childPath, keyStart, keyEnd, valueStart, valueEnd })
        if (i < keys.length - 1) w(',')
        w('\n')
      }
      w(indentUnit.repeat(depth) + '}')
      return
    }
    // 兜底：function / symbol / undefined 在 JSON.stringify 里是 null（数组里）或省略（对象里）；
    // 走到这里说明输入不是合法 JSON 已 parse 出来的对象，安全起见输出 null。
    w('null')
  }

  // 实际入口：root 总是有一条 path = 'root' 的索引
  const rootValueStart = length
  emitWithPath(root, 'root', 0)
  const rootValueEnd = length
  index.push({ path: 'root', keyStart: -1, keyEnd: -1, valueStart: rootValueStart, valueEnd: rootValueEnd })

  return { text: chunks.join(''), index }
}

function handle(req: WorkerReq): WorkerRes {
  try {
    switch (req.op) {
      case 'format': {
        if (!req.input.trim()) return { id: req.id, ok: true, output: '' }
        const obj = JSON.parse(req.input)
        if (req.withIndex) {
          const { text, index } = stringifyWithIndex(obj, req.indent)
          return { id: req.id, ok: true, output: text, index }
        }
        return { id: req.id, ok: true, output: JSON.stringify(obj, null, req.indent) }
      }
      case 'minify': {
        if (!req.input.trim()) return { id: req.id, ok: true, output: '' }
        const obj = JSON.parse(req.input)
        return { id: req.id, ok: true, output: JSON.stringify(obj) }
      }
      case 'escape': {
        return { id: req.id, ok: true, output: JSON.stringify(req.input) }
      }
      case 'unescape': {
        const trimmed = req.input.trim()
        if (!trimmed) return { id: req.id, ok: true, output: '' }
        const wrapped = trimmed.startsWith('"') ? trimmed : `"${trimmed}"`
        const v = JSON.parse(wrapped)
        if (typeof v !== 'string') {
          return { id: req.id, ok: false, error: '反转义结果不是字符串' }
        }
        return { id: req.id, ok: true, output: v }
      }
      case 'parse': {
        // 把 JSON.parse 搬到 worker，让主线程在树视图重建时不卡。
        // 注意：postMessage 仍要把 parsed root 结构化克隆到主线程，主线程会有一次 ~150ms 反序列化代价，
        // 但比同步 parse 整段（300-500ms）少一半多，且 parse 本身完全异步。
        if (!req.input.trim()) return { id: req.id, ok: true, root: null }
        const root = JSON.parse(req.input)
        return { id: req.id, ok: true, root }
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { id: req.id, ok: false, error: msg, errorPos: extractErrorPos(msg) }
  }
}

const ctx = self as unknown as DedicatedWorkerGlobalScope
ctx.onmessage = (ev: MessageEvent<WorkerReq>) => {
  const res = handle(ev.data)
  ctx.postMessage(res)
}
