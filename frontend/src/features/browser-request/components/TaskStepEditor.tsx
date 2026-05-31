import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ParameterizeBubble } from './ParameterizeBubble'
import { ExtractTree } from './ExtractTree'
import { useTextSelection } from '../hooks/useTextSelection'
import { validateParameterization } from '../utils/tokenMatch'
import type {
  AdhocRequest, ExtractSpec, HttpCallView, ParameterizationSpec, StepSpec,
} from '../types'

interface Props {
  step: StepSpec
  /** 用于在标记参数化时校验 token；同时显示原始 url/body */
  call: HttpCallView | null
  /** 已存在的所有变量名（来自 task.params + 上游 step.extracts），供 ParameterizeBubble 联想 */
  varSuggestions: string[]
  onChange: (next: StepSpec) => void
  onRemove: () => void
}

/**
 * 单 step 编辑：标题/url/body 显示 + 选区参数化气泡 + 已加的参数化/抽取列表 + 响应树（抽取）。
 */
export function TaskStepEditor({ step, call, varSuggestions, onChange, onRemove }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const selection = useTextSelection(containerRef.current)
  const [bubbleField, setBubbleField] = useState<string | null>(null)
  // 锁定选区：bubble 上的 input 一旦 focus，浏览器会清掉 URL 里的 doc 选区，
  // 我们必须把首次有效 selection 缓存下来，否则 selection.text 一空 bubble 就消失
  const [lockedToken, setLockedToken] = useState<{ text: string; rect: DOMRect; field: string } | null>(null)
  useEffect(() => {
    if (bubbleField && selection.text && selection.anchorRect) {
      setLockedToken({ text: selection.text, rect: selection.anchorRect, field: bubbleField })
    }
  }, [bubbleField, selection.text, selection.anchorRect])
  // 用户手动关掉「标变量」按钮（onActivate(null)）时同步清掉锁，下次重新弹要新的选区
  useEffect(() => {
    if (!bubbleField) setLockedToken(null)
  }, [bubbleField])
  const closeBubble = () => {
    setBubbleField(null)
    setLockedToken(null)
    window.getSelection()?.removeAllRanges()
  }

  const adhoc: AdhocRequest = step.adhoc ?? (call ? {
    method: call.method, url: call.url, headers: call.requestHeaders,
    body: call.requestBody ?? null, responseSample: call.responseBody ?? null,
  } : { method: 'GET', url: '', headers: {}, body: null, responseSample: null })
  // 响应体优先用 step.adhoc.responseSample（task 内置快照）；老数据 fallback 到当前 recording 的 call
  const responseSample = adhoc.responseSample ?? call?.responseBody ?? null

  const parameterizations = step.parameterizations ?? []
  const extracts = step.extracts ?? []

  // 高亮已参数化的片段：根据 ParameterizationSpec.field+token 在 url/body 中标出来
  // （为简化：只在文本中显示原始；右侧侧栏列出已绑定的 parameterization）

  const tryAddParam = (field: string, token: string, varName: string) => {
    if (parameterizations.some(p => p.field === field && p.token === token)) {
      alert('已经标过这段了')
      return
    }
    const v = validateParameterization(field, token, adhoc)
    if (!v.ok) {
      alert(v.error)
      return
    }
    onChange({ ...step, parameterizations: [...parameterizations, { field, token, varName }] })
    closeBubble()
  }

  const removeParam = (idx: number) => {
    onChange({ ...step, parameterizations: parameterizations.filter((_, i) => i !== idx) })
  }

  const addExtract = (jsonPath: string, name: string) => {
    if (extracts.some(e => e.name === name)) {
      alert(`抽取名 "${name}" 已存在`)
      return
    }
    onChange({ ...step, extracts: [...extracts, { name, jsonPath } as ExtractSpec] })
  }
  const removeExtract = (idx: number) => {
    onChange({ ...step, extracts: extracts.filter((_, i) => i !== idx) })
  }

  // 决定 ParameterizeBubble 用哪个 field（依据是当前选区落在哪个 textarea 上）
  // 简化：用户点 url / body / 各 header / 各 query 之前先点对应「标变量」按钮，把 bubble 状态切换
  return (
    <Card>
      <CardContent className="space-y-3 p-3" ref={containerRef as React.RefObject<HTMLDivElement>}>
        <div className="flex items-center gap-2">
          <Input
            value={step.name}
            onChange={e => onChange({ ...step, name: e.target.value })}
            className="flex-1 font-medium"
            placeholder="step 名"
          />
          <Button size="sm" variant="ghost" onClick={onRemove} title="移除此 step">
            <Trash2 className="size-4" />
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* 左：原始请求只读视图 + 触发参数化 */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-[var(--color-muted-foreground)]">请求 ({adhoc.method})</div>

            <FieldView
              label="URL"
              field="url"
              value={adhoc.url}
              activeField={bubbleField}
              onActivate={setBubbleField}
            />
            {adhoc.body && (
              <FieldView
                label="Body"
                field="body"
                value={adhoc.body}
                activeField={bubbleField}
                onActivate={setBubbleField}
                multiline
              />
            )}

            <div className="text-xs">
              <div className="mb-1 font-medium text-[var(--color-muted-foreground)]">
                已标参数（{parameterizations.length}）
              </div>
              <ul className="space-y-1">
                {parameterizations.length === 0 && (
                  <li className="text-[10px] text-[var(--color-muted-foreground)]">
                    在上方选中文字 → 命名为变量
                  </li>
                )}
                {parameterizations.map((p, i) => (
                  <li key={i} className="flex items-center gap-1 rounded bg-[var(--color-muted)] p-1 text-[10px]">
                    <Badge variant="secondary">${`{${p.varName}}`}</Badge>
                    <span className="font-mono">{p.field}</span>
                    <span className="min-w-0 flex-1 truncate font-mono" title={p.token}>← {p.token}</span>
                    <Button size="sm" variant="ghost" onClick={() => removeParam(i)} className="h-5 px-1">
                      <Trash2 className="size-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 右：响应树（抽取） */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-[var(--color-muted-foreground)]">响应 (点字段抽取)</div>
            <ExtractTree
              responseBody={responseSample}
              onPickPath={(jsonPath, defaultName) => addExtract(jsonPath, defaultName)}
              existingExtracts={extracts}
            />
            <div className="text-xs">
              <div className="mb-1 font-medium text-[var(--color-muted-foreground)]">
                已抽取（{extracts.length}）
              </div>
              <ul className="space-y-1">
                {extracts.length === 0 && (
                  <li className="text-[10px] text-[var(--color-muted-foreground)]">
                    在右上方响应树上点字段 → 命名
                  </li>
                )}
                {extracts.map((e, i) => (
                  <li key={i} className="flex items-center gap-1 rounded bg-[var(--color-muted)] p-1 text-[10px]">
                    <Badge variant="secondary">${`{${e.name}}`}</Badge>
                    <span className="min-w-0 flex-1 truncate font-mono" title={e.jsonPath}>{e.jsonPath}</span>
                    <Button size="sm" variant="ghost" onClick={() => removeExtract(i)} className="h-5 px-1">
                      <Trash2 className="size-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
      {lockedToken && (
        <ParameterizeBubble
          token={lockedToken.text}
          anchorRect={lockedToken.rect}
          field={lockedToken.field}
          varSuggestions={varSuggestions}
          onConfirm={varName => tryAddParam(lockedToken.field, lockedToken.text, varName)}
          onCancel={closeBubble}
        />
      )}
    </Card>
  )
}

function FieldView({
  label, field, value, activeField, onActivate, multiline,
}: {
  label: string
  field: string
  value: string
  activeField: string | null
  onActivate: (f: string | null) => void
  multiline?: boolean
}) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-[10px] text-[var(--color-muted-foreground)]">
        <span>{label}</span>
        <span className="text-[var(--color-muted-foreground)]">· 双击词语直接标变量</span>
        <Button
          size="sm"
          variant={activeField === field ? 'default' : 'outline'}
          className="ml-auto h-5 px-2 text-[10px]"
          onClick={() => onActivate(activeField === field ? null : field)}
        >
          {activeField === field ? '选中文字命名变量 (Esc 取消)' : '标变量'}
        </Button>
      </div>
      <div
        data-field={field}
        // 双击：浏览器会自动选中那个词；同步激活本字段的 bubble，让弹窗立刻出来
        onDoubleClick={() => onActivate(field)}
        className={`cursor-text rounded border bg-[var(--color-muted)] p-2 font-mono text-xs ${
          multiline ? 'max-h-40 overflow-auto whitespace-pre-wrap break-all' : 'overflow-x-auto whitespace-nowrap'
        }`}
        title="双击词语 → 立即标为变量；或先点上方「标变量」再手动选区"
      >
        {value}
      </div>
    </div>
  )
}
