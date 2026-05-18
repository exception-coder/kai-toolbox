import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, PlayCircle, Repeat, Square, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { listSavedRequests, listVars, startForeach, type ForeachBody } from '../api'
import type { ExecuteRequestBody, SavedRequestView } from '../types'
import { evalJsonPath } from '../utils/jsonpath'

const VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

type Source = 'response' | 'var' | 'paste'
type BodyMode = 'editor' | 'saved'

interface ProgressEntry {
  index: number
  status?: number
  statusText?: string
  finalUrl?: string
  elapsedMs?: number
  sample?: string
  error?: string
}

interface RunState {
  total: number
  done: number
  ok: number
  failed: number
  entries: ProgressEntry[]
  finished: boolean
  aggregatedVar?: string
  aggregatedSize?: number
  errorMessage?: string
}

const VARS_KEY = (sid: string) => ['browser-request', 'vars', sid] as const
const SAVED_KEY = (sid: string) => ['browser-request', 'saved', sid] as const

/**
 * 批量执行面板。会用到当前编辑器的请求模板/最近响应，因此父组件需把这两个传进来。
 */
export function ForeachPanel({
  sessionId, currentRequest, lastResponseBody,
}: {
  sessionId: string
  /** 当前编辑器里的请求模板（curl 或结构化） */
  currentRequest: ExecuteRequestBody | null
  /** 最近一次执行的响应体（JSON 字符串），可能为 null */
  lastResponseBody: string | null
}) {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { data: vars = [] } = useQuery({
    queryKey: VARS_KEY(sessionId),
    queryFn: () => listVars(sessionId),
  })
  const { data: saved = [] } = useQuery({
    queryKey: SAVED_KEY(sessionId),
    queryFn: () => listSavedRequests(sessionId),
  })

  // ── 循环源 ──
  const [source, setSource] = useState<Source>('response')
  const [sourcePath, setSourcePath] = useState('$.data')
  const [sourceVarName, setSourceVarName] = useState('')
  const [sourcePaste, setSourcePaste] = useState('')

  // ── 循环体 ──
  const [bodyMode, setBodyMode] = useState<BodyMode>('editor')
  const [savedId, setSavedId] = useState<string>('')

  // ── 聚合（可选） ──
  const [aggEnabled, setAggEnabled] = useState(false)
  const [aggPath, setAggPath] = useState('$')
  const [aggName, setAggName] = useState('')

  const [run, setRun] = useState<RunState | null>(null)
  const abortRef = useRef<(() => void) | null>(null)

  // 解析循环源 → JSON 数组
  const items: unknown[] | null = useMemo(() => {
    try {
      if (source === 'response') {
        if (!lastResponseBody) return null
        const obj = JSON.parse(lastResponseBody)
        const v = evalJsonPath(obj, sourcePath)
        return Array.isArray(v) ? v : null
      }
      if (source === 'var') {
        const v = vars.find(x => x.name === sourceVarName)
        if (!v) return null
        const parsed = JSON.parse(v.value)
        return Array.isArray(parsed) ? parsed : null
      }
      // paste
      if (!sourcePaste.trim()) return null
      const parsed = JSON.parse(sourcePaste)
      return Array.isArray(parsed) ? parsed : null
    } catch { return null }
  }, [source, sourcePath, sourceVarName, sourcePaste, lastResponseBody, vars])

  const requestTemplate: ExecuteRequestBody | null = useMemo(() => {
    if (bodyMode === 'editor') return currentRequest
    const r = saved.find(s => s.id === savedId)
    if (!r) return null
    return {
      curl: r.curl ?? undefined,
      method: r.method ?? undefined,
      url: r.url ?? undefined,
      headers: r.headers,
      body: r.body ?? undefined,
    }
  }, [bodyMode, currentRequest, saved, savedId])

  const canStart =
    items !== null && items.length > 0 &&
    requestTemplate !== null && (requestTemplate.curl || requestTemplate.url) &&
    !run?.entries // run 没启动过 OR 已完成

  const start = async () => {
    if (!items || !requestTemplate) return
    if (items.length > 200) {
      const ok = await confirm({
        title: '批量执行确认',
        description: `即将执行 ${items.length} 次请求，确认继续？`,
        confirmText: '继续',
      })
      if (!ok) return
    }
    const body: ForeachBody = {
      items,
      request: requestTemplate,
      aggregate: aggEnabled && VAR_NAME_RE.test(aggName) && aggPath
        ? { name: aggName, jsonPath: aggPath }
        : null,
    }
    setRun({ total: items.length, done: 0, ok: 0, failed: 0, entries: [], finished: false })
    abortRef.current = startForeach(sessionId, body, {
      onEvent: (eventName, data) => {
        const d = data as Record<string, unknown>
        if (eventName === 'started') {
          setRun(prev => prev ? { ...prev, total: Number(d.total ?? prev.total) } : prev)
        } else if (eventName === 'progress') {
          setRun(prev => prev ? {
            ...prev,
            done: prev.done + 1,
            ok: prev.ok + (d.error ? 0 : 1),
            failed: prev.failed + (d.error ? 1 : 0),
            entries: [...prev.entries, d as unknown as ProgressEntry],
          } : prev)
        } else if (eventName === 'completed') {
          setRun(prev => prev ? {
            ...prev,
            finished: true,
            aggregatedVar: d.aggregatedVar as string | undefined,
            aggregatedSize: d.aggregatedSize as number | undefined,
          } : prev)
          if (d.aggregatedVar) {
            qc.invalidateQueries({ queryKey: VARS_KEY(sessionId) })
          }
        } else if (eventName === 'error') {
          setRun(prev => prev ? { ...prev, finished: true, errorMessage: String(d.message) } : prev)
        }
      },
      onError: e => {
        setRun(prev => prev ? { ...prev, finished: true, errorMessage: (e as Error).message } : prev)
      },
    })
  }

  const cancel = () => {
    abortRef.current?.()
    abortRef.current = null
    setRun(prev => prev ? { ...prev, finished: true, errorMessage: '已取消' } : prev)
  }

  const reset = () => {
    abortRef.current?.()
    abortRef.current = null
    setRun(null)
  }

  return (
    <div className="rounded-xl border bg-[var(--color-card)] p-4">
      <div className="mb-2 flex items-center gap-2">
        <Repeat className="h-4 w-4" />
        <div className="text-sm font-medium">批量执行</div>
        <span className="text-xs text-[var(--color-muted-foreground)]">
          串行重放 N 次，循环体里用 <code>{'{{item.xxx}}'}</code> 访问当前元素
        </span>
      </div>

      {!run && (
        <div className="space-y-3">
          {/* 循环源 */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium">循环源</div>
            <div className="flex gap-1 text-xs">
              <SegBtn active={source === 'response'} onClick={() => setSource('response')}>从最近响应</SegBtn>
              <SegBtn active={source === 'var'} onClick={() => setSource('var')}>从变量池</SegBtn>
              <SegBtn active={source === 'paste'} onClick={() => setSource('paste')}>手动粘贴</SegBtn>
            </div>
            {source === 'response' && (
              <div className="flex items-center gap-2">
                <Input
                  className="font-mono"
                  placeholder="$.data"
                  value={sourcePath}
                  onChange={e => setSourcePath(e.target.value)}
                  disabled={!lastResponseBody}
                />
                {!lastResponseBody && (
                  <span className="text-xs text-[var(--color-muted-foreground)]">先在上方执行一次请求</span>
                )}
              </div>
            )}
            {source === 'var' && (
              <select
                className="w-full rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm"
                value={sourceVarName}
                onChange={e => setSourceVarName(e.target.value)}
              >
                <option value="">— 选择变量 —</option>
                {vars.map(v => (
                  <option key={v.name} value={v.name}>
                    {v.name} ({(v.value.length > 40 ? v.value.slice(0, 40) + '…' : v.value)})
                  </option>
                ))}
              </select>
            )}
            {source === 'paste' && (
              <textarea
                className="min-h-[80px] w-full rounded-md border bg-[var(--color-background)] p-2 font-mono text-xs"
                placeholder='[{"slug":"a"},{"slug":"b"}]'
                value={sourcePaste}
                onChange={e => setSourcePaste(e.target.value)}
              />
            )}
            <div className="text-xs">
              {items === null
                ? <span className="text-[var(--color-destructive)]">未解析出有效数组</span>
                : <span className="text-[var(--color-muted-foreground)]">共 {items.length} 项</span>}
            </div>
          </div>

          {/* 循环体 */}
          <div className="space-y-1.5">
            <div className="text-xs font-medium">循环体</div>
            <div className="flex gap-1 text-xs">
              <SegBtn active={bodyMode === 'editor'} onClick={() => setBodyMode('editor')}>当前编辑器</SegBtn>
              <SegBtn active={bodyMode === 'saved'} onClick={() => setBodyMode('saved')}>已保存请求</SegBtn>
            </div>
            {bodyMode === 'saved' && (
              <select
                className="w-full rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm"
                value={savedId}
                onChange={e => setSavedId(e.target.value)}
              >
                <option value="">— 选择 —</option>
                {saved.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
            <div className="text-xs text-[var(--color-muted-foreground)]">
              提示：在请求模板里写 <code>{'{{item.slug}}'}</code> / <code>{'{{item.id}}'}</code> 访问当前项的字段
            </div>
          </div>

          {/* 聚合 */}
          <div className="space-y-1.5">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={aggEnabled}
                onChange={e => setAggEnabled(e.target.checked)}
              />
              <span>聚合：把每次响应里的字段提取后存为变量</span>
            </label>
            {aggEnabled && (
              <div className="flex gap-2">
                <Input
                  className="flex-1 font-mono"
                  placeholder="$.data.title"
                  value={aggPath}
                  onChange={e => setAggPath(e.target.value)}
                />
                <Input
                  className="w-40"
                  placeholder="变量名"
                  value={aggName}
                  onChange={e => setAggName(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* 执行按钮 */}
          <div>
            <Button onClick={start} disabled={!canStart} size="sm">
              <PlayCircle />
              {items ? `执行 ${items.length} 次` : '执行'}
            </Button>
          </div>
        </div>
      )}

      {run && <RunView run={run} onCancel={cancel} onReset={reset} />}
    </div>
  )
}

function SegBtn({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2 py-1 ${
        active ? 'border-[var(--color-primary)] bg-[var(--color-accent)]' : 'hover:bg-[var(--color-accent)]'
      }`}
    >
      {children}
    </button>
  )
}

function RunView({
  run, onCancel, onReset,
}: {
  run: RunState
  onCancel: () => void
  onReset: () => void
}) {
  const pct = run.total > 0 ? Math.round((run.done / run.total) * 100) : 0
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        {!run.finished && <Loader2 className="h-4 w-4 animate-spin" />}
        {run.finished && !run.errorMessage && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        {run.finished && run.errorMessage && <XCircle className="h-4 w-4 text-red-500" />}
        <span>
          {run.done} / {run.total}
          <span className="ml-2 text-xs text-[var(--color-muted-foreground)]">
            （成功 {run.ok}，失败 {run.failed}）
          </span>
        </span>
        <div className="ml-auto flex gap-1">
          {!run.finished && (
            <Button size="sm" variant="destructive" onClick={onCancel}>
              <Square />
              取消
            </Button>
          )}
          {run.finished && (
            <Button size="sm" variant="outline" onClick={onReset}>
              重置
            </Button>
          )}
        </div>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-muted)]">
        <div
          className={`h-full ${run.errorMessage ? 'bg-red-500' : 'bg-[var(--color-primary)]'}`}
          style={{ width: `${pct}%`, transition: 'width 0.2s ease' }}
        />
      </div>

      {run.errorMessage && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-xs">
          {run.errorMessage}
        </div>
      )}
      {run.aggregatedVar && (
        <div className="rounded border border-green-500/40 bg-green-500/10 p-2 text-xs">
          已把 {run.aggregatedSize} 个聚合值存为变量 <code>{`{{${run.aggregatedVar}}}`}</code>
        </div>
      )}

      <details>
        <summary className="cursor-pointer text-xs text-[var(--color-muted-foreground)]">
          逐条结果（{run.entries.length}）
        </summary>
        <ul className="mt-2 max-h-72 space-y-1 overflow-auto">
          {run.entries.map(e => (
            <li key={e.index} className="flex items-center gap-2 rounded border p-1.5 text-xs">
              <span className="w-10 shrink-0 text-right text-[var(--color-muted-foreground)]">
                #{e.index + 1}
              </span>
              {e.error
                ? <Badge variant="destructive">ERR</Badge>
                : <Badge variant={(e.status ?? 0) >= 400 ? 'destructive' : 'secondary'}>
                    {e.status} {e.statusText}
                  </Badge>}
              <span className="w-14 shrink-0 text-[var(--color-muted-foreground)]">
                {e.elapsedMs} ms
              </span>
              <span className="min-w-0 flex-1 truncate font-mono"
                    title={e.error ?? e.sample ?? ''}>
                {e.error ?? e.sample ?? ''}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  )
}
