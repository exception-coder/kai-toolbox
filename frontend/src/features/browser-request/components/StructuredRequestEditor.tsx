import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { KeyValueFieldsEditor, type KvPair } from './KeyValueFieldsEditor'
import { VarBindableField, type VarOption } from './VarPickerPopover'
import { JsonTreeEditor, parseJsonBody, serializeJsonBody } from './JsonTreeEditor'
import { parseCurl } from '../utils/curlParser'
import { parseUrl, serializeUrl, type QueryParam } from '../utils/url'
import type { ExecuteRequestBody } from '../types'

/**
 * 共享的「结构化请求编辑器」：method / URL / query / headers / body。
 *
 * - PipelinePanel.StepEditor 用它编辑 step.request
 * - ForeachPanel 用它编辑循环体模板（receivedTemplate state）
 * - body 区域支持 JSON 树状 / 原文本切换
 * - 每个 value 输入框都能双击 / 点 🎯 绑变量（变量来源由 varOptions 提供）
 *
 * 顶部提供「粘 cURL → 解析填充」入口，失败时显示 inline 错误（onParseError 回调上抛供调用方做硬拒绝）。
 */
export function StructuredRequestEditor({
  request, onChange, varOptions, showCurlPaste = true, onParseError,
}: {
  request: ExecuteRequestBody
  onChange: (next: ExecuteRequestBody) => void
  varOptions: VarOption[]
  showCurlPaste?: boolean
  /** cURL 解析失败时通知调用方（用于阶段 4 的硬拒绝保存） */
  onParseError?: (err: string | null) => void
}) {
  // != null 同时挡 undefined / 后端序列化的 null，避免结构化模式被误判成 cURL 模式
  const isCurl = request.curl != null

  // URL 拆 base + query
  const parsedUrl = parseUrl(request.url ?? '')
  const setBaseUrl = (base: string) => onChange({ ...request, url: serializeUrl({ ...parsedUrl, base }) })
  const setQuery = (query: QueryParam[]) => onChange({ ...request, url: serializeUrl({ ...parsedUrl, query }) })

  // headers Map ↔ KvPair[]
  const headerPairs: KvPair[] = Object.entries(request.headers ?? {}).map(([k, v]) => ({ key: k, value: v }))
  const setHeaderPairs = (pairs: KvPair[]) => {
    const headers: Record<string, string> = {}
    for (const p of pairs) if (p.key.trim()) headers[p.key] = p.value
    onChange({ ...request, headers })
  }

  // 顶部「粘 cURL 解析」
  const [pasteCurl, setPasteCurl] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const handleParseAndFill = () => {
    if (!pasteCurl.trim()) return
    try {
      const parsed = parseCurl(pasteCurl)
      onChange({
        method: parsed.method, url: parsed.url, headers: parsed.headers, body: parsed.body,
      })
      setPasteCurl('')
      setParseError(null)
      onParseError?.(null)
    } catch (e) {
      const msg = (e as Error).message
      setParseError(msg)
      onParseError?.(msg)
    }
  }

  return (
    <div className="space-y-3">
      {/* cURL 粘贴入口 */}
      {showCurlPaste && (
        <div className="rounded-md border border-dashed bg-[var(--color-muted)]/30 p-2">
          <div className="mb-1 text-xs text-[var(--color-muted-foreground)]">
            有 cURL？粘到这里点「解析填充」自动拆成下方字段
          </div>
          <div className="flex gap-2">
            <textarea
              className="min-h-[40px] flex-1 rounded-md border bg-[var(--color-background)] p-2 font-mono text-xs"
              placeholder="curl 'https://...' -H '...' --data '...'"
              value={pasteCurl}
              onChange={e => { setPasteCurl(e.target.value); if (parseError) { setParseError(null); onParseError?.(null) } }}
            />
            <Button size="sm" onClick={handleParseAndFill} disabled={!pasteCurl.trim()}>
              解析填充
            </Button>
          </div>
          {parseError && (
            <div className="mt-1 text-xs text-[var(--color-destructive)]">
              解析失败：{parseError}
            </div>
          )}
        </div>
      )}

      {isCurl ? (
        // 兼容老 step：cURL 模式仍可编辑文本
        <textarea
          className="min-h-[80px] w-full rounded-md border bg-[var(--color-background)] p-2 font-mono text-xs"
          value={request.curl ?? ''}
          placeholder="粘贴 cURL"
          onChange={e => onChange({ ...request, curl: e.target.value })}
        />
      ) : (
        <>
          {/* 方法 + URL */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium">方法 + URL</div>
            <div className="flex gap-2">
              <select
                className="rounded-md border bg-[var(--color-background)] px-2 text-sm"
                value={request.method ?? 'GET'}
                onChange={e => onChange({ ...request, method: e.target.value })}
              >
                {['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'].map(m => <option key={m}>{m}</option>)}
              </select>
              <VarBindableField
                className="flex-1"
                value={parsedUrl.base}
                onChange={setBaseUrl}
                options={varOptions}
                placeholder="https://api.example.com/v1/path"
              />
            </div>
          </div>

          {/* Query 参数 */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">Query 参数</span>
              <span className="text-[var(--color-muted-foreground)]">
                ({parsedUrl.query.length} 个) · 每行 value 双击 / 点 🎯 绑变量
              </span>
            </div>
            <KeyValueFieldsEditor
              pairs={parsedUrl.query}
              onChange={setQuery}
              varOptions={varOptions}
              addLabel="+ 添加 query"
            />
          </div>

          {/* Headers */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-medium">Headers</span>
              <span className="text-[var(--color-muted-foreground)]">
                ({headerPairs.length} 个)
              </span>
            </div>
            <KeyValueFieldsEditor
              pairs={headerPairs}
              onChange={setHeaderPairs}
              varOptions={varOptions}
              addLabel="+ 添加 header"
            />
          </div>

          {/* Body — JSON 树状 / 原文本 */}
          <BodyEditor
            body={request.body ?? ''}
            onChange={b => onChange({ ...request, body: b })}
            varOptions={varOptions}
          />
        </>
      )}
    </div>
  )
}

function BodyEditor({
  body, onChange, varOptions,
}: {
  body: string
  onChange: (next: string) => void
  varOptions: VarOption[]
}) {
  const parsed = parseJsonBody(body)
  const canTree = parsed.ok && (parsed.value === null || typeof parsed.value === 'object')
  const treeValue = parsed.ok ? parsed.value : null
  const [mode, setMode] = useState<'tree' | 'text'>(canTree ? 'tree' : 'text')

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium">Body</span>
        <div className="flex rounded-md border p-0.5">
          <button
            type="button"
            onClick={() => setMode('tree')}
            disabled={!canTree}
            className={`rounded px-2 py-0.5 ${
              mode === 'tree'
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'
            } ${!canTree ? 'opacity-50' : ''}`}
            title={canTree ? '' : '当前 body 不是合法 JSON 对象/数组，无法用树状编辑'}
          >
            JSON 树状
          </button>
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`rounded px-2 py-0.5 ${
              mode === 'text'
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]'
            }`}
          >
            原文本
          </button>
        </div>
        <span className="text-[var(--color-muted-foreground)]">
          GET/HEAD 留空；纯变量值序列化时输出 raw 不带引号
        </span>
      </div>

      {!parsed.ok && mode === 'tree' && (
        <div className="rounded border border-yellow-500/40 bg-yellow-500/10 p-2 text-xs">
          当前 body 不是合法 JSON：{parsed.err}。切到原文本模式编辑。
        </div>
      )}

      {mode === 'tree' && canTree ? (
        <JsonTreeEditor
          value={treeValue ?? {}}
          onChange={v => onChange(serializeJsonBody(v))}
          varOptions={varOptions}
        />
      ) : (
        <textarea
          className="min-h-[80px] w-full rounded-md border bg-[var(--color-background)] p-2 font-mono text-xs"
          placeholder='{"key":"{{var}}"}'
          value={body}
          onChange={e => onChange(e.target.value)}
        />
      )}
    </div>
  )
}
