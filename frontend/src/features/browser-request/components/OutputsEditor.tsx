import * as React from 'react'
import { useState } from 'react'
import { Crosshair, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { OutputSpec } from '../types'
import { PathPickerDialog } from './PathPickerDialog'

/**
 * Outputs 配置编辑器，PipelinePanel 的 step 和 SavedRequestPanel 的 saved 请求共用。
 * outputs：[{ name, jsonPath, persist }]
 *   - name      变量名（写入 chain vars 或 session vars 的 key）
 *   - jsonPath  从响应里提取的路径（支持 $.a.b[0].c[*]）
 *   - persist   true 时除 chain vars 还落 session vars（DB），跨运行可用
 */
export function OutputsEditor({
  outputs, onChange, hint, responseBody,
}: {
  outputs: OutputSpec[]
  onChange: (outputs: OutputSpec[]) => void
  hint?: React.ReactNode
  /** 可选的响应样本。提供后每行 JSONPath 输入框旁边出现「从响应挑选」按钮，弹点选 dialog。 */
  responseBody?: string | null
}) {
  const update = (idx: number, mut: (o: OutputSpec) => OutputSpec) => {
    const next = outputs.slice()
    next[idx] = mut(next[idx])
    onChange(next)
  }
  /** 当前展开 PathPicker 的 output 下标，null 表示无 */
  const [pickingIndex, setPickingIndex] = useState<number | null>(null)
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-medium">
        输出
        {hint && (
          <span className="ml-2 text-[var(--color-muted-foreground)]">{hint}</span>
        )}
      </div>

      {/* 示例说明：用户经常困惑「变量名」和「JSONPath」分别填什么——给两类典型响应（对象 / 数组根）的例子 */}
      <details className="rounded border border-dashed bg-[var(--color-muted)]/40 p-2 text-xs">
        <summary className="cursor-pointer font-medium">怎么填？看示例（含「响应本身就是数组」的情况）</summary>
        <div className="mt-2 space-y-3">
          {/* 场景 A：响应是对象 */}
          <div>
            <div className="mb-1 font-medium">A. 响应是对象（最常见）</div>
            <pre className="rounded bg-[var(--color-background)] p-1.5 font-mono text-[11px]">
{`{
  "data": {
    "token": "abc123",
    "list": [ {"id":1,"name":"a"}, {"id":2,"name":"b"} ]
  }
}`}
            </pre>
            <table className="mt-1 w-full text-[11px]">
              <thead className="text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="text-left">想取的字段</th>
                  <th className="text-left">变量名</th>
                  <th className="text-left">JSONPath</th>
                  <th className="text-left">提取到的值</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr><td>token</td><td>token</td><td>$.data.token</td><td>"abc123"</td></tr>
                <tr><td>整个 list 数组</td><td>list</td><td>$.data.list</td><td>[{`{...}, {...}`}]</td></tr>
                <tr><td>所有 id（扁平）</td><td>ids</td><td>$.data.list[*].id</td><td>[1, 2]</td></tr>
                <tr><td>第一项的 name</td><td>firstName</td><td>$.data.list[0].name</td><td>"a"</td></tr>
              </tbody>
            </table>
          </div>

          {/* 场景 B：响应顶层就是数组 */}
          <div>
            <div className="mb-1 font-medium">B. 响应顶层就是数组（要喂给 foreach 时常见）</div>
            <pre className="rounded bg-[var(--color-background)] p-1.5 font-mono text-[11px]">
{`[
  {"slug":"a","id":1},
  {"slug":"b","id":2}
]`}
            </pre>
            <table className="mt-1 w-full text-[11px]">
              <thead className="text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="text-left">想取的字段</th>
                  <th className="text-left">变量名</th>
                  <th className="text-left">JSONPath</th>
                  <th className="text-left">提取到的值</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                <tr><td>整个数组（喂 foreach）</td><td>items</td><td>$</td><td>[{`{...}, {...}`}]</td></tr>
                <tr><td>所有 slug（扁平）</td><td>slugs</td><td>$[*].slug</td><td>["a","b"]</td></tr>
                <tr><td>第一项</td><td>first</td><td>$[0]</td><td>{`{"slug":"a","id":1}`}</td></tr>
                <tr><td>第一项的 slug</td><td>firstSlug</td><td>$[0].slug</td><td>"a"</td></tr>
              </tbody>
            </table>
            <div className="mt-1 text-[var(--color-muted-foreground)]">
              下一步 foreach：「循环源」填 <code>items</code>，循环体内用 <code>{'{{item.slug}}'}</code> 取每一项的字段。
            </div>
          </div>

          <div className="text-[var(--color-muted-foreground)]">
            后续步骤里写 <code>{'{{token}}'}</code> / <code>{'{{ids}}'}</code> / <code>{'{{items}}'}</code> 即可引用。
            勾「持久化」会同时落 DB（变量池），跨运行可见；不勾只在本次运行内有效。
          </div>
        </div>
      </details>

      {outputs.length === 0 && (
        <div className="text-xs text-[var(--color-muted-foreground)]">（无输出 —— 点下方「+ 输出」开始）</div>
      )}
      {outputs.map((o, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            className="w-32 font-mono"
            placeholder="变量名 如 token"
            value={o.name}
            onChange={e => update(i, x => ({ ...x, name: e.target.value }))}
          />
          <Input
            className="flex-1 font-mono"
            placeholder="JSONPath 如 $.data.token"
            value={o.jsonPath}
            onChange={e => update(i, x => ({ ...x, jsonPath: e.target.value }))}
            list={responseBody ? `out-path-list-${i}` : undefined}
          />
          {/* datalist：从响应体抽出顶层和 1-2 层的可用路径作 input 自动补全 */}
          {responseBody && (
            <datalist id={`out-path-list-${i}`}>
              {topLevelPathSuggestions(responseBody).map(p => (
                <option key={p} value={p} />
              ))}
            </datalist>
          )}
          {responseBody && (
            <Button size="sm" variant="ghost"
                    onClick={() => setPickingIndex(i)}
                    title="从响应里点着挑 JSONPath">
              <Crosshair />
            </Button>
          )}
          <label className="inline-flex items-center gap-1 text-xs"
                 title="勾选后变量也写入会话变量池（DB 持久化），跨运行可见">
            <input
              type="checkbox"
              checked={o.persist}
              onChange={e => update(i, x => ({ ...x, persist: e.target.checked }))}
            />
            <span>持久化</span>
          </label>
          <Button size="sm" variant="ghost"
                  onClick={() => onChange(outputs.filter((_, j) => j !== i))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button size="sm" variant="secondary"
              onClick={() => onChange([...outputs, { name: '', jsonPath: '$', persist: false }])}>
        <Plus />
        + 输出
      </Button>

      {pickingIndex !== null && responseBody && (
        <PathPickerDialog
          body={responseBody}
          initialPath={outputs[pickingIndex]?.jsonPath || '$'}
          onPick={p => update(pickingIndex, x => ({ ...x, jsonPath: p }))}
          onClose={() => setPickingIndex(null)}
        />
      )}
    </div>
  )
}

/**
 * 从响应 JSON 抽出常用路径作 datalist 候选——不递归全展开，只给前 1-2 层 + 数组 [0]。
 * 这是给 Input 的 datalist 用，让用户敲 `$.` 时自动出下拉，配合 PathPickerDialog 满足 "点选 + 手敲" 双场景。
 */
function topLevelPathSuggestions(body: string): string[] {
  try {
    const obj = JSON.parse(body)
    const out = new Set<string>(['$'])
    visit(obj, '$', out, 0)
    return Array.from(out).slice(0, 100)
  } catch {
    return []
  }
}

function visit(node: unknown, path: string, out: Set<string>, depth: number) {
  if (depth >= 3) return
  if (node == null) return
  if (Array.isArray(node)) {
    out.add(`${path}[0]`)
    out.add(`${path}[*]`)
    if (node.length > 0) visit(node[0], `${path}[0]`, out, depth + 1)
  } else if (typeof node === 'object') {
    for (const k of Object.keys(node).slice(0, 30)) {
      const safe = /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? `${path}.${k}` : `${path}["${k}"]`
      out.add(safe)
      visit((node as Record<string, unknown>)[k], safe, out, depth + 1)
    }
  }
}
