// 把 JSON 渐进式展开为 React Flow 节点图。
// 设计：parse 一次拿到 root，buildFlow(root, expanded) 只为「已展开」的路径创建节点；
// 单节点的行数有上限，超过则末尾追加一个 truncated 占位行。

/** path id 内部分隔符。用 ASCII 控制字符 US (Unit Separator) 避免与 JSON key 内容冲突。
 *  例如 key 含点号 `"a.b"` 也不会让 path 出歧义。展示时仍可用普通分隔符渲染。 */
export const PATH_SEP = '\x1f'

/** 拼出 root 起的 path id。pathOf('root', 'data') === 'root\x1fdata'。 */
export function pathOf(parent: string, key: string | number): string {
  return parent + PATH_SEP + key
}

export type Primitive = string | number | boolean | null

export interface PrimitiveCell {
  kind: 'string' | 'number' | 'boolean' | 'null'
  /** 已格式化的展示文本（字符串带引号；长字符串截断）。 */
  text: string
}

export interface RowData {
  /** 行 id，节点内唯一，作为 React Flow 出线 handle id。 */
  rowId: string
  key: string
  primitive?: PrimitiveCell
  /** 指向子节点；通过 expanded set 决定子节点是否真的渲染。 */
  child?: { id: string; summary: string; isArray: boolean }
}

// extends Record 是为了满足 React Flow v12 对 Node["data"] 的约束（必须可作为字符串索引签名）。
export interface JsonNodeData extends Record<string, unknown> {
  title: string
  isArray: boolean
  rows: RowData[]
  /** 入参 entries 总数（rows 可能被截断）。 */
  totalRows: number
  /** 节点在 expanded 中时为 true。 */
  depth: number
}

export interface JsonFlowNode {
  id: string
  type: 'jsonNode'
  position: { x: number; y: number }
  data: JsonNodeData
  width: number
  height: number
}

export interface JsonFlowEdge {
  id: string
  source: string
  sourceHandle: string
  target: string
}

export interface FlowResult {
  nodes: JsonFlowNode[]
  edges: JsonFlowEdge[]
  /** 命中 MAX_NODES 上限被截断。 */
  overflow: boolean
  nodeCount: number
}

export type ParseResult =
  | { ok: true; root: unknown }
  | { ok: false; error: string }

export interface BuildOptions {
  /** 真正会渲染成独立节点的 id 集合；不在集合里的子节点不绘制，但其父节点的 row 上仍显示 `{N}/[N]` 摘要。 */
  expanded: ReadonlySet<string>
}

/** 渲染节点上限：超过即停建并标 overflow。懒展开后正常用户操作很难触发。 */
const MAX_NODES = 500
/** 单节点最多绘制的 row 数。节点内会出滚动条，所以这里可以放比较大；超过仍追加 truncated 占位行。 */
const MAX_ROWS_PER_NODE = 2000
const COL_WIDTH = 360
const NODE_WIDTH = 320
const ROW_HEIGHT = 22
const NODE_HEADER = 28
const NODE_PADDING = 8
const NODE_GAP_Y = 16
/** 节点视觉高度上限：超出就让节点内部出滚动条；同时给布局用，避免单个大节点把整列拉得很长。 */
const NODE_VISUAL_MAX_HEIGHT = 480
const PRIMITIVE_MAX_LEN = 80
const COLLECT_ALL_LIMIT = 500

/** 给 JsonNode 渲染层暴露的版面常量，保持 jsonToFlow 内布局与 React 组件视觉一致。 */
export const LAYOUT_CONSTS = {
  NODE_WIDTH,
  NODE_HEADER,
  NODE_PADDING,
  ROW_HEIGHT,
  NODE_VISUAL_MAX_HEIGHT,
}

function formatPrimitive(v: Primitive): PrimitiveCell {
  if (v === null) return { kind: 'null', text: 'null' }
  if (typeof v === 'boolean') return { kind: 'boolean', text: String(v) }
  if (typeof v === 'number') return { kind: 'number', text: String(v) }
  let text = JSON.stringify(v)
  if (text.length > PRIMITIVE_MAX_LEN) text = text.slice(0, PRIMITIVE_MAX_LEN - 1) + '…"'
  return { kind: 'string', text }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

function isContainer(v: unknown): v is Record<string, unknown> | unknown[] {
  return v !== null && typeof v === 'object'
}

/** 节点视觉高度：rows 多的时候封顶到 NODE_VISUAL_MAX_HEIGHT，节点内部出滚动条。 */
function nodeHeight(rows: number): number {
  const natural = NODE_HEADER + NODE_PADDING * 2 + rows * ROW_HEIGHT
  return Math.min(natural, NODE_VISUAL_MAX_HEIGHT)
}

/** 解析 JSON 字符串，失败返回 ok:false。 */
export function parseJson(input: string): ParseResult {
  if (!input.trim()) return { ok: true, root: null }
  try {
    return { ok: true, root: JSON.parse(input) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '解析失败' }
  }
}

/**
 * 按 `expanded` 集合渲染 React Flow 节点。
 * `expanded` 必须至少包含 'root'，否则返回空图。
 */
export function buildFlow(root: unknown, { expanded }: BuildOptions): FlowResult {
  const nodes: JsonFlowNode[] = []
  const edges: JsonFlowEdge[] = []
  let overflow = false

  if (root === undefined) return { nodes, edges, overflow, nodeCount: 0 }

  // root 是 primitive 时单独处理
  if (!isContainer(root)) {
    if (!expanded.has('root')) return { nodes, edges, overflow, nodeCount: 0 }
    nodes.push({
      id: 'root',
      type: 'jsonNode',
      position: { x: 0, y: 0 },
      width: NODE_WIDTH,
      height: nodeHeight(1),
      data: {
        title: '(root)',
        isArray: false,
        depth: 0,
        totalRows: 1,
        rows: [{ rowId: 'r0', key: '$', primitive: formatPrimitive(root as Primitive) }],
      },
    })
    return { nodes, edges, overflow: false, nodeCount: 1 }
  }

  function build(value: Record<string, unknown> | unknown[], id: string, depth: number): void {
    if (overflow) return
    if (!expanded.has(id)) return
    if (nodes.length >= MAX_NODES) {
      overflow = true
      return
    }

    const isArray = Array.isArray(value)
    const totalLen = isArray ? (value as unknown[]).length : Object.keys(value).length
    const sliceLen = Math.min(totalLen, MAX_ROWS_PER_NODE)

    const rows: RowData[] = []
    for (let i = 0; i < sliceLen; i++) {
      const key = isArray ? String(i) : Object.keys(value as object)[i]
      const v = isArray ? (value as unknown[])[i] : (value as Record<string, unknown>)[key]
      const rowId = `r${i}`
      if (isContainer(v)) {
        const childId = pathOf(id, key)
        const childIsArray = Array.isArray(v)
        const childLen = childIsArray ? (v as unknown[]).length : Object.keys(v as object).length
        rows.push({
          rowId,
          key,
          child: { id: childId, summary: childIsArray ? `[${childLen}]` : `{${childLen}}`, isArray: childIsArray },
        })
        // 子节点只在 expanded 中时才连线 + 递归。否则 row 仅显示摘要。
        if (expanded.has(childId)) {
          edges.push({
            id: `${id}__${childId}__${rowId}`,
            source: id,
            sourceHandle: rowId,
            target: childId,
          })
          build(v, childId, depth + 1)
        }
      } else {
        rows.push({ rowId, key, primitive: formatPrimitive(v as Primitive) })
      }
    }

    if (totalLen > MAX_ROWS_PER_NODE) {
      rows.push({
        rowId: 'r_truncated',
        key: `…还有 ${totalLen - MAX_ROWS_PER_NODE} 项未显示`,
        primitive: { kind: 'null', text: '' },
      })
    }

    nodes.push({
      id,
      type: 'jsonNode',
      position: { x: 0, y: 0 }, // 占位，下面 layout pass 改
      width: NODE_WIDTH,
      height: nodeHeight(rows.length),
      data: {
        title: isArray ? `[${totalLen}]` : `{${totalLen}}`,
        isArray,
        depth,
        totalRows: totalLen,
        rows,
      },
    })
  }

  build(root, 'root', 0)

  // 布局 pass：按 depth 分列；同列 y 累加节点高度。
  const sorted = [...nodes].sort((a, b) => (a.data.depth - b.data.depth) || a.id.localeCompare(b.id))
  const colCursor = new Map<number, number>()
  for (const n of sorted) {
    const y = colCursor.get(n.data.depth) ?? 0
    n.position = { x: n.data.depth * COL_WIDTH, y }
    colCursor.set(n.data.depth, y + n.height + NODE_GAP_Y)
  }

  return { nodes, edges, overflow, nodeCount: nodes.length }
}

/**
 * 收集 root 下所有 object/array 路径，受 max 上限保护。
 * 用于「全展开」按钮一次性放出大量节点。
 */
export function collectAllPaths(root: unknown, max = COLLECT_ALL_LIMIT): Set<string> {
  const out = new Set<string>()
  if (!isContainer(root)) {
    out.add('root')
    return out
  }
  out.add('root')

  function walk(v: unknown, id: string): void {
    if (out.size >= max) return
    if (!isContainer(v)) return
    const entries: Array<[string, unknown]> = Array.isArray(v)
      ? (v as unknown[]).map((x, i) => [String(i), x])
      : Object.entries(v)
    for (const [k, child] of entries) {
      if (out.size >= max) return
      if (isContainer(child)) {
        const childId = pathOf(id, k)
        out.add(childId)
        walk(child, childId)
      }
    }
  }

  walk(root, 'root')
  return out
}

/** 提供给 UI 的全展开上限提示。 */
export const COLLECT_ALL_MAX = COLLECT_ALL_LIMIT

// 兼容旧导出：仍提供 jsonToFlow（同 parse + buildFlow，默认全展开到上限）。
export function jsonToFlow(input: string): { ok: true; result: FlowResult } | { ok: false; error: string } {
  const p = parseJson(input)
  if (!p.ok) return { ok: false, error: p.error }
  const expanded = collectAllPaths(p.root, MAX_NODES)
  return { ok: true, result: buildFlow(p.root, { expanded }) }
}

// 同时把已弃用提示加上：建议用 parseJson + buildFlow 组合
// （JsonPanel 已切到新 API，这个导出留给可能的旧调用方。）
