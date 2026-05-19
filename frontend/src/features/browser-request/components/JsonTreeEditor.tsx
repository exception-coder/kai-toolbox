import { useMemo } from 'react'
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { VarBindableField, type VarOption } from './VarPickerPopover'

/**
 * JSON body 树状编辑器：每个 key/value 一行，支持类型切换 + 双击/🎯 绑变量。
 *
 * 关键策略：
 *   - 内部用 `unknown` 表示 JSON 节点（同 JSON.parse 结果），渲染时按 typeof 分支
 *   - 变量引用（如 `{{userId}}`）作为 string 类型存放；序列化时识别后**输出 raw 不加引号**
 *     （这样后端 TemplateRenderer 替换变量后仍是合法 JSON：`{"id":123}` 而非 `{"id":"123"}`）
 *   - 嵌套深度 ≤ MAX_DEPTH，超出折叠"过深，请用 textarea 模式"
 *
 * 序列化/反序列化函数导出供调用方在 ExecuteRequestBody.body string 与树状结构间转换。
 */

const MAX_DEPTH = 5
const VAR_REF_RE = /^\{\{\s*[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*|\[\d+\])*\s*\}\}$/

type JsonKind = 'string' | 'number' | 'boolean' | 'null' | 'object' | 'array'

function kindOf(v: unknown): JsonKind {
  if (v === null) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'object') return 'object'
  if (typeof v === 'string') return 'string'
  if (typeof v === 'number') return 'number'
  if (typeof v === 'boolean') return 'boolean'
  return 'null'
}

function defaultValueOf(kind: JsonKind): unknown {
  switch (kind) {
    case 'string': return ''
    case 'number': return 0
    case 'boolean': return false
    case 'null': return null
    case 'object': return {}
    case 'array': return []
  }
}

/**
 * 把 JSON body string 解析成树状值。失败返回 `{ ok: false }`，调用方降级 textarea。
 */
export function parseJsonBody(text: string): { ok: true; value: unknown } | { ok: false; err: string } {
  const trimmed = text.trim()
  if (!trimmed) return { ok: true, value: {} }
  try {
    return { ok: true, value: JSON.parse(trimmed) }
  } catch (e) {
    return { ok: false, err: (e as Error).message }
  }
}

/**
 * 把树状值序列化回 JSON body string。
 * 关键：纯变量引用字符串（如 `"{{userId}}"`）输出 raw `{{userId}}` 不带引号，
 *      让后端模板渲染后是合法 JSON 数字/对象。
 */
export function serializeJsonBody(value: unknown): string {
  return stringify(value, 0)
}

function stringify(node: unknown, depth: number): string {
  if (depth > 30) return 'null' // 防递归炸
  if (node === null || node === undefined) return 'null'
  if (typeof node === 'boolean') return String(node)
  if (typeof node === 'number') return Number.isFinite(node) ? String(node) : 'null'
  if (typeof node === 'string') {
    if (VAR_REF_RE.test(node.trim())) return node.trim() // 变量引用 raw
    return JSON.stringify(node)
  }
  if (Array.isArray(node)) {
    return '[' + node.map(v => stringify(v, depth + 1)).join(',') + ']'
  }
  if (typeof node === 'object') {
    const parts: string[] = []
    for (const [k, v] of Object.entries(node)) {
      parts.push(JSON.stringify(k) + ':' + stringify(v, depth + 1))
    }
    return '{' + parts.join(',') + '}'
  }
  return 'null'
}

// ── 组件 ─────────────────────────────────────────────────────────────────────

export function JsonTreeEditor({
  value, onChange, varOptions,
}: {
  /** 树状值（unknown，可能是 object / array / primitive）。 */
  value: unknown
  onChange: (next: unknown) => void
  varOptions: VarOption[]
}) {
  return (
    <JsonNode
      value={value}
      onChange={onChange}
      varOptions={varOptions}
      depth={0}
    />
  )
}

function JsonNode({
  value, onChange, varOptions, depth,
}: {
  value: unknown
  onChange: (next: unknown) => void
  varOptions: VarOption[]
  depth: number
}) {
  const kind = kindOf(value)
  if (kind === 'object' || kind === 'array') {
    if (depth >= MAX_DEPTH) {
      return (
        <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs">
          嵌套过深（{depth + 1} 层）—— 请改用顶部的 textarea 模式编辑此字段
        </div>
      )
    }
    return (
      <ContainerNode value={value as object | unknown[]} onChange={onChange} varOptions={varOptions} depth={depth} />
    )
  }
  // primitive
  return (
    <PrimitiveNode value={value} onChange={onChange} varOptions={varOptions} />
  )
}

function ContainerNode({
  value, onChange, varOptions, depth,
}: {
  value: object | unknown[]
  onChange: (next: unknown) => void
  varOptions: VarOption[]
  depth: number
}) {
  const isArray = Array.isArray(value)
  const entries = isArray
    ? (value as unknown[]).map((v, i) => ({ key: String(i), value: v }))
    : Object.entries(value as Record<string, unknown>).map(([k, v]) => ({ key: k, value: v }))

  const updateEntry = (idx: number, newKey: string, newValue: unknown) => {
    if (isArray) {
      const next = (value as unknown[]).slice()
      next[idx] = newValue
      onChange(next)
    } else {
      const obj = value as Record<string, unknown>
      const keys = Object.keys(obj)
      const next: Record<string, unknown> = {}
      keys.forEach((k, i) => {
        if (i === idx) {
          next[newKey] = newValue
        } else {
          next[k] = obj[k]
        }
      })
      onChange(next)
    }
  }
  const removeEntry = (idx: number) => {
    if (isArray) {
      onChange((value as unknown[]).filter((_, i) => i !== idx))
    } else {
      const obj = value as Record<string, unknown>
      const keys = Object.keys(obj)
      const next: Record<string, unknown> = {}
      keys.forEach((k, i) => { if (i !== idx) next[k] = obj[k] })
      onChange(next)
    }
  }
  const addEntry = () => {
    if (isArray) {
      onChange([...(value as unknown[]), ''])
    } else {
      const obj = value as Record<string, unknown>
      // 找一个不冲突的默认 key
      let i = 1
      let name = 'newField'
      while (name in obj) { name = `newField${i++}` }
      onChange({ ...obj, [name]: '' })
    }
  }

  return (
    <div className={`space-y-1 ${depth > 0 ? 'border-l-2 border-[var(--color-border)] pl-2' : ''}`}>
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted-foreground)]">
        {isArray ? `array · ${entries.length} 项` : `object · ${entries.length} 字段`}
      </div>
      {entries.map((e, idx) => (
        <EntryRow
          key={idx}
          isArray={isArray}
          entryKey={e.key}
          entryValue={e.value}
          onKeyChange={k => updateEntry(idx, k, e.value)}
          onValueChange={v => updateEntry(idx, e.key, v)}
          onRemove={() => removeEntry(idx)}
          varOptions={varOptions}
          depth={depth}
        />
      ))}
      <Button size="sm" variant="outline" onClick={addEntry}>
        <Plus />
        {isArray ? '+ 添加项' : '+ 添加字段'}
      </Button>
    </div>
  )
}

function EntryRow({
  isArray, entryKey, entryValue, onKeyChange, onValueChange, onRemove, varOptions, depth,
}: {
  isArray: boolean
  entryKey: string
  entryValue: unknown
  onKeyChange: (k: string) => void
  onValueChange: (v: unknown) => void
  onRemove: () => void
  varOptions: VarOption[]
  depth: number
}) {
  const kind = kindOf(entryValue)
  const isContainer = kind === 'object' || kind === 'array'
  return (
    <div className="rounded border bg-[var(--color-card)] p-1.5">
      <div className="flex items-center gap-1">
        {isArray ? (
          <code className="w-12 shrink-0 text-center font-mono text-xs text-[var(--color-muted-foreground)]">
            [{entryKey}]
          </code>
        ) : (
          <Input
            className="w-32 font-mono"
            value={entryKey}
            onChange={e => onKeyChange(e.target.value)}
            placeholder="key"
          />
        )}
        <select
          className="rounded border bg-[var(--color-background)] px-1 text-xs"
          value={kind}
          onChange={e => onValueChange(defaultValueOf(e.target.value as JsonKind))}
          title="改类型会清空当前值"
        >
          {(['string', 'number', 'boolean', 'null', 'object', 'array'] as JsonKind[]).map(k => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
        {!isContainer && (
          <PrimitiveValueInput
            kind={kind}
            value={entryValue}
            onChange={onValueChange}
            varOptions={varOptions}
          />
        )}
        <Button size="sm" variant="ghost" onClick={onRemove} title="删除">
          <Trash2 />
        </Button>
      </div>
      {isContainer && (
        <div className="mt-1">
          <JsonNode
            value={entryValue}
            onChange={onValueChange}
            varOptions={varOptions}
            depth={depth + 1}
          />
        </div>
      )}
    </div>
  )
}

function PrimitiveNode({
  value, onChange, varOptions,
}: {
  value: unknown
  onChange: (next: unknown) => void
  varOptions: VarOption[]
}) {
  return (
    <PrimitiveValueInput kind={kindOf(value)} value={value} onChange={onChange} varOptions={varOptions} />
  )
}

function PrimitiveValueInput({
  kind, value, onChange, varOptions,
}: {
  kind: JsonKind
  value: unknown
  onChange: (next: unknown) => void
  varOptions: VarOption[]
}) {
  if (kind === 'null') {
    return <span className="px-2 text-xs italic text-[var(--color-muted-foreground)]">null</span>
  }
  if (kind === 'boolean') {
    return (
      <select
        className="rounded border bg-[var(--color-background)] px-1 text-xs"
        value={String(value)}
        onChange={e => onChange(e.target.value === 'true')}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    )
  }
  // string / number 都用 VarBindableField，差别在序列化时识别 var ref
  return (
    <VarBindableField
      className="flex-1"
      value={value == null ? '' : String(value)}
      onChange={raw => {
        if (kind === 'number') {
          // 变量引用 → 保留字符串（后端渲染替换）；普通数字 → 转 Number
          if (VAR_REF_RE.test(raw.trim())) onChange(raw.trim())
          else if (raw.trim() === '') onChange(0)
          else {
            const n = Number(raw)
            onChange(Number.isFinite(n) ? n : raw)
          }
        } else {
          onChange(raw)
        }
      }}
      options={varOptions}
      placeholder={kind === 'number' ? '0 或 {{var}}' : 'string 或 {{var}}'}
    />
  )
}

/**
 * 顶层入口 hook：从 body string 解析、给 onChange 写回 string。
 * 用法：
 *   const { tree, ok, err, setTree } = useJsonTree(body, onBodyChange)
 *   if (!ok) return <textarea fallback />
 *   return <JsonTreeEditor value={tree} onChange={setTree} ... />
 */
export function useJsonTree(
  body: string,
  onBodyChange: (next: string) => void,
): { tree: unknown; ok: boolean; err: string | null; setTree: (v: unknown) => void } {
  const parsed = useMemo(() => parseJsonBody(body), [body])
  const ok = parsed.ok
  const tree = ok ? parsed.value : null
  const err = ok ? null : parsed.err
  const setTree = (v: unknown) => onBodyChange(serializeJsonBody(v))
  return { tree, ok, err, setTree }
}
